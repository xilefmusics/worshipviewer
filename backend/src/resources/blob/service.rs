use actix_files::NamedFile;
use tracing::instrument;

use shared::MoveOwner;
use shared::api::ListQuery;
use shared::blob::{Blob, CreateBlob, PatchBlob};

use crate::auth::AuthorizationContext;
use crate::database::Database;
use crate::error::AppError;
use crate::resources::team::{parse_owner_record_id, thing_record_key};

use super::repository::BlobRepository;
use super::storage::BlobStorage;
use super::storage::FsBlobStorage;
use super::surreal_repo::SurrealBlobRepo;

#[derive(Clone)]
pub struct BlobService<R, S> {
    pub repo: R,
    pub storage: S,
}

impl<R, S> BlobService<R, S> {
    pub fn new(repo: R, storage: S) -> Self {
        Self { repo, storage }
    }
}

impl<R: BlobRepository, S: BlobStorage> BlobService<R, S> {
    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn list_blobs_for_user(
        &self,
        ctx: &AuthorizationContext,
        pagination: ListQuery,
    ) -> Result<Vec<Blob>, AppError> {
        let read_teams = ctx.read_teams();
        self.repo.get_blobs(&read_teams, pagination).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn count_blobs_for_user(
        &self,
        ctx: &AuthorizationContext,
        pagination: &ListQuery,
    ) -> Result<u64, AppError> {
        let read_teams = ctx.read_teams();
        self.repo.count_blobs(&read_teams, pagination).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn get_blob_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Blob, AppError> {
        let read_teams = ctx.read_teams();
        self.repo.get_blob(&read_teams, id).await
    }

    #[instrument(level = "debug", err, skip(self, ctx, blob))]
    pub async fn create_blob_for_user(
        &self,
        ctx: &AuthorizationContext,
        mut blob: CreateBlob,
    ) -> Result<Blob, AppError> {
        let owner = match blob.owner.take() {
            None => ctx.personal_team()?,
            Some(ref s) => {
                let rid = parse_owner_record_id(s)?;
                ctx.require_write_access_to_owner(&rid)?;
                rid
            }
        };
        let created = self.repo.create_blob(owner, blob).await?;
        self.storage.write_blob_file(&created)?;
        Ok(created)
    }

    #[instrument(level = "debug", err, skip(self, ctx, blob))]
    pub async fn update_blob_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        blob: CreateBlob,
    ) -> Result<Blob, AppError> {
        let write_teams = ctx.write_teams();
        let updated = self.repo.update_blob(&write_teams, id, blob).await?;
        self.storage.write_blob_file(&updated)?;
        Ok(updated)
    }

    #[instrument(level = "debug", err, skip(self, ctx, patch))]
    pub async fn patch_blob_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        patch: PatchBlob,
    ) -> Result<Blob, AppError> {
        let current = self.get_blob_for_user(ctx, id).await?;
        let merged = CreateBlob {
            owner: None,
            file_type: patch.file_type.unwrap_or(current.file_type),
            width: patch.width.unwrap_or(current.width),
            height: patch.height.unwrap_or(current.height),
            ocr: patch.ocr.unwrap_or(current.ocr),
        };
        self.update_blob_for_user(ctx, id, merged).await
    }

    #[instrument(level = "debug", err, skip(self, ctx, payload))]
    pub async fn move_blob_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        payload: MoveOwner,
    ) -> Result<Blob, AppError> {
        let blob = self.get_blob_for_user(ctx, id).await?;
        let current = parse_owner_record_id(&blob.owner)?;
        let dest = parse_owner_record_id(&payload.owner)?;
        if thing_record_key(&current) == thing_record_key(&dest) {
            return Ok(blob);
        }
        ctx.require_write_access_to_owner(&current)?;
        ctx.require_write_access_to_owner(&dest)?;
        let write_teams = ctx.write_teams();
        self.repo.move_blob_owner(&write_teams, id, dest).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn delete_blob_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Blob, AppError> {
        let write_teams = ctx.write_teams();
        let deleted = self.repo.delete_blob(&write_teams, id).await?;
        self.storage.delete_blob_file(&deleted);
        Ok(deleted)
    }

    #[instrument(level = "debug", err, skip(self, ctx, data))]
    pub async fn upload_blob_data_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        data: &[u8],
    ) -> Result<(), AppError> {
        // Reuse update_blob for the permission check: it scopes by write_teams and returns
        // 404 if the caller has no write access, which is exactly the right behavior here.
        let write_teams = ctx.write_teams();
        let blob = self
            .repo
            .get_blob(&write_teams, id)
            .await
            .map_err(|_| AppError::NotFound("blob not found or write access denied".into()))?;
        self.storage.write_blob_bytes(&blob, data)
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn open_blob_data_file_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<(Blob, NamedFile), AppError> {
        let read_teams = ctx.read_teams();
        let blob = self.repo.get_blob(&read_teams, id).await?;
        let file = self.storage.open_blob_data_file(&blob)?;
        Ok((blob, file))
    }
}

/// Production type alias used in HTTP wiring.
pub type BlobServiceHandle = BlobService<SurrealBlobRepo, FsBlobStorage>;

impl BlobServiceHandle {
    pub fn build(db: std::sync::Arc<Database>, blob_dir: String) -> Self {
        BlobService::new(
            SurrealBlobRepo::new(db.clone()),
            FsBlobStorage::new(blob_dir),
        )
    }
}

#[cfg(test)]
mod tests {
    use async_trait::async_trait;
    use surrealdb::types::RecordId;

    use shared::api::ListQuery;
    use shared::blob::{Blob, CreateBlob, FileType};

    use crate::error::AppError;
    use crate::resources::User;
    use crate::test_helpers::{auth_ctx_for_user, auth_ctx_test_personal_team};

    use super::super::repository::BlobRepository;
    use super::super::storage::BlobStorage;
    use super::BlobService;

    struct MockBlobRepo {
        blobs: Vec<Blob>,
    }

    #[async_trait]
    impl BlobRepository for MockBlobRepo {
        async fn get_blobs(
            &self,
            _read_teams: &[RecordId],
            _pagination: ListQuery,
        ) -> Result<Vec<Blob>, AppError> {
            Ok(self.blobs.clone())
        }

        async fn count_blobs(
            &self,
            _read_teams: &[RecordId],
            _pagination: &ListQuery,
        ) -> Result<u64, AppError> {
            Ok(self.blobs.len() as u64)
        }

        async fn get_blob(&self, _read_teams: &[RecordId], _id: &str) -> Result<Blob, AppError> {
            self.blobs
                .first()
                .cloned()
                .ok_or_else(|| AppError::NotFound("blob not found".into()))
        }

        async fn create_blob(&self, _owner: RecordId, blob: CreateBlob) -> Result<Blob, AppError> {
            Ok(Blob {
                id: "new".into(),
                owner: "team".into(),
                file_type: blob.file_type,
                width: blob.width,
                height: blob.height,
                ocr: blob.ocr,
            })
        }

        async fn update_blob(
            &self,
            _write_teams: &[RecordId],
            _id: &str,
            _blob: CreateBlob,
        ) -> Result<Blob, AppError> {
            self.blobs
                .first()
                .cloned()
                .ok_or_else(|| AppError::NotFound("blob not found".into()))
        }

        async fn delete_blob(
            &self,
            _write_teams: &[RecordId],
            _id: &str,
        ) -> Result<Blob, AppError> {
            self.blobs
                .first()
                .cloned()
                .ok_or_else(|| AppError::NotFound("blob not found".into()))
        }

        async fn move_blob_owner(
            &self,
            _write_teams: &[RecordId],
            _id: &str,
            _new_owner: RecordId,
        ) -> Result<Blob, AppError> {
            unreachable!("not used in these tests")
        }
    }

    struct NullStorage;

    impl BlobStorage for NullStorage {
        fn write_blob_file(&self, _blob: &Blob) -> Result<(), AppError> {
            Ok(())
        }
        fn write_blob_bytes(&self, _blob: &Blob, _data: &[u8]) -> Result<(), AppError> {
            Ok(())
        }
        fn delete_blob_file(&self, _blob: &Blob) {}
        fn open_blob_data_file(&self, _blob: &Blob) -> Result<actix_files::NamedFile, AppError> {
            Err(AppError::NotFound("no file".into()))
        }
    }

    fn test_user() -> User {
        User::new("u@test.local")
    }

    #[tokio::test]
    async fn get_returns_not_found_when_empty() {
        let user = test_user();
        let svc = BlobService::new(MockBlobRepo { blobs: vec![] }, NullStorage);
        let ctx = auth_ctx_test_personal_team(&user);
        let r = svc.get_blob_for_user(&ctx, "b1").await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    #[tokio::test]
    async fn create_calls_storage_write() {
        let user = test_user();
        let svc = BlobService::new(MockBlobRepo { blobs: vec![] }, NullStorage);
        let ctx = auth_ctx_test_personal_team(&user);
        let r = svc
            .create_blob_for_user(
                &ctx,
                CreateBlob {
                    owner: None,
                    file_type: FileType::PNG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await;
        assert!(r.is_ok());
    }

    #[tokio::test]
    async fn delete_not_found_propagates() {
        let user = test_user();
        let svc = BlobService::new(MockBlobRepo { blobs: vec![] }, NullStorage);
        let ctx = auth_ctx_test_personal_team(&user);
        let r = svc.delete_blob_for_user(&ctx, "missing").await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    #[tokio::test]
    async fn blc_blob_crud() {
        use shared::team::TeamRole;

        use crate::test_helpers::{
            blob_service, configure_personal_team_members, create_user, personal_team_id, test_db,
        };

        let blob_dir = tempfile::tempdir().expect("tempdir");
        let db = test_db().await.expect("db");
        let svc = blob_service(&db, blob_dir.path().to_string_lossy().into_owned());

        let owner = create_user(&db, "blob-owner@test.local").await.expect("o");
        let other = create_user(&db, "blob-other@test.local").await.expect("x");
        let team_id = personal_team_id(&db, &owner).await.expect("team");
        configure_personal_team_members(
            &db,
            &owner,
            &team_id,
            vec![(other.id.clone(), TeamRole::Guest)],
        )
        .await
        .expect("acl");

        let owner_perms = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let other_perms = auth_ctx_for_user(&db, &other).await.expect("auth");

        let b = svc
            .create_blob_for_user(
                &owner_perms,
                CreateBlob {
                    owner: None,
                    file_type: FileType::PNG,
                    width: 10,
                    height: 10,
                    ocr: "hi".into(),
                },
            )
            .await
            .expect("create");

        let list = svc
            .list_blobs_for_user(&owner_perms, ListQuery::default())
            .await
            .expect("list");
        assert!(list.iter().any(|x| x.id == b.id));

        svc.get_blob_for_user(&owner_perms, &b.id)
            .await
            .expect("get");
        svc.get_blob_for_user(&other_perms, &b.id)
            .await
            .expect("guest read");

        let miss = svc.get_blob_for_user(&other_perms, "never-created").await;
        assert!(matches!(miss, Err(AppError::NotFound(_))));

        svc.delete_blob_for_user(&owner_perms, &b.id)
            .await
            .expect("delete");
    }

    /// Build a four-user blob fixture: owner, content_maintainer, guest, non-member.
    async fn four_user_blob_fixture() -> (
        std::sync::Arc<crate::database::Database>,
        crate::resources::User,
        crate::resources::User,
        crate::resources::User,
        crate::resources::User,
        String,
    ) {
        use crate::test_helpers::{
            configure_personal_team_members, create_user, personal_team_id, test_db,
        };
        use shared::team::TeamRole;

        let db = test_db().await.expect("db");
        let owner = create_user(&db, "b3f-owner@test.local")
            .await
            .expect("owner");
        let cm = create_user(&db, "b3f-cm@test.local").await.expect("cm");
        let guest = create_user(&db, "b3f-guest@test.local")
            .await
            .expect("guest");
        let non_member = create_user(&db, "b3f-nonmember@test.local")
            .await
            .expect("nm");
        let tid = personal_team_id(&db, &owner).await.expect("tid");
        configure_personal_team_members(
            &db,
            &owner,
            &tid,
            vec![
                (cm.id.clone(), TeamRole::ContentMaintainer),
                (guest.id.clone(), TeamRole::Guest),
            ],
        )
        .await
        .expect("acl");
        (db, owner, cm, guest, non_member, tid)
    }

    /// BLC-BLOB-002: non-member reading a blob returns NotFound.
    #[tokio::test]
    async fn blc_blob_002_non_member_read_not_found() {
        let blob_dir = tempfile::tempdir().expect("tempdir");
        let (db, owner, _cm, _guest, non_member, _tid) = four_user_blob_fixture().await;
        let svc =
            crate::test_helpers::blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let nm_p = auth_ctx_for_user(&db, &non_member).await.expect("auth");
        let b = svc
            .create_blob_for_user(
                &owner_p,
                CreateBlob {
                    owner: None,
                    file_type: FileType::PNG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await
            .expect("create");
        let r = svc.get_blob_for_user(&nm_p, &b.id).await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-BLOB-002: content_maintainer on the team can update a blob.
    #[tokio::test]
    async fn blc_blob_002_content_maintainer_can_update() {
        let blob_dir = tempfile::tempdir().expect("tempdir");
        let (db, owner, cm, _guest, _nm, _tid) = four_user_blob_fixture().await;
        let svc =
            crate::test_helpers::blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let cm_p = auth_ctx_for_user(&db, &cm).await.expect("auth");
        let b = svc
            .create_blob_for_user(
                &owner_p,
                CreateBlob {
                    owner: None,
                    file_type: FileType::PNG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await
            .expect("create");
        svc.update_blob_for_user(
            &cm_p,
            &b.id,
            CreateBlob {
                owner: None,
                file_type: FileType::JPEG,
                width: 2,
                height: 2,
                ocr: String::new(),
            },
        )
        .await
        .expect("cm update");
    }

    /// BLC-BLOB-007: guest cannot update a blob.
    #[tokio::test]
    async fn blc_blob_007_guest_update_not_found() {
        let blob_dir = tempfile::tempdir().expect("tempdir");
        let (db, owner, _cm, guest, _nm, _tid) = four_user_blob_fixture().await;
        let svc =
            crate::test_helpers::blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let guest_p = auth_ctx_for_user(&db, &guest).await.expect("auth");
        let b = svc
            .create_blob_for_user(
                &owner_p,
                CreateBlob {
                    owner: None,
                    file_type: FileType::PNG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await
            .expect("create");
        let r = svc
            .update_blob_for_user(
                &guest_p,
                &b.id,
                CreateBlob {
                    owner: None,
                    file_type: FileType::JPEG,
                    width: 2,
                    height: 2,
                    ocr: String::new(),
                },
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-BLOB-007: guest cannot delete a blob.
    #[tokio::test]
    async fn blc_blob_007_guest_delete_not_found() {
        let blob_dir = tempfile::tempdir().expect("tempdir");
        let (db, owner, _cm, guest, _nm, _tid) = four_user_blob_fixture().await;
        let svc =
            crate::test_helpers::blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let guest_p = auth_ctx_for_user(&db, &guest).await.expect("auth");
        let b = svc
            .create_blob_for_user(
                &owner_p,
                CreateBlob {
                    owner: None,
                    file_type: FileType::PNG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await
            .expect("create");
        let r = svc.delete_blob_for_user(&guest_p, &b.id).await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-BLOB-008: personal team owner can update a blob they own.
    #[tokio::test]
    async fn blc_blob_008_personal_owner_can_update() {
        let blob_dir = tempfile::tempdir().expect("tempdir");
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_blob_fixture().await;
        let svc =
            crate::test_helpers::blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let b = svc
            .create_blob_for_user(
                &owner_p,
                CreateBlob {
                    owner: None,
                    file_type: FileType::PNG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await
            .expect("create");
        svc.update_blob_for_user(
            &owner_p,
            &b.id,
            CreateBlob {
                owner: None,
                file_type: FileType::JPEG,
                width: 5,
                height: 5,
                ocr: "updated".into(),
            },
        )
        .await
        .expect("owner update");
    }

    /// BLC-BLOB-003: PUT does not change the blob's owner field.
    #[tokio::test]
    async fn blc_blob_003_put_does_not_change_owner() {
        let blob_dir = tempfile::tempdir().expect("tempdir");
        let (db, owner, _cm, _guest, _nm, tid) = four_user_blob_fixture().await;
        let svc =
            crate::test_helpers::blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let b = svc
            .create_blob_for_user(
                &owner_p,
                CreateBlob {
                    owner: None,
                    file_type: FileType::PNG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await
            .expect("create");
        assert_eq!(b.owner, tid, "blob owner must be personal team");
        let updated = svc
            .update_blob_for_user(
                &owner_p,
                &b.id,
                CreateBlob {
                    owner: None,
                    file_type: FileType::JPEG,
                    width: 2,
                    height: 2,
                    ocr: String::new(),
                },
            )
            .await
            .expect("update");
        assert_eq!(updated.owner, tid, "owner must not change after PUT");
    }

    /// BLC-BLOB-005: creating blob with image/png is accepted.
    #[tokio::test]
    async fn blc_blob_005_create_png_ok() {
        let blob_dir = tempfile::tempdir().expect("tempdir");
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_blob_fixture().await;
        let svc =
            crate::test_helpers::blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let b = svc
            .create_blob_for_user(
                &owner_p,
                CreateBlob {
                    owner: None,
                    file_type: FileType::PNG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await
            .expect("png ok");
        assert_eq!(b.file_type, FileType::PNG);
    }

    /// BLC-BLOB-005: creating blob with image/jpeg is accepted.
    #[tokio::test]
    async fn blc_blob_005_create_jpeg_ok() {
        let blob_dir = tempfile::tempdir().expect("tempdir");
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_blob_fixture().await;
        let svc =
            crate::test_helpers::blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let b = svc
            .create_blob_for_user(
                &owner_p,
                CreateBlob {
                    owner: None,
                    file_type: FileType::JPEG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await
            .expect("jpeg ok");
        assert_eq!(b.file_type, FileType::JPEG);
    }

    /// BLC-BLOB-005: creating blob with image/svg is accepted.
    #[tokio::test]
    async fn blc_blob_005_create_svg_ok() {
        let blob_dir = tempfile::tempdir().expect("tempdir");
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_blob_fixture().await;
        let svc =
            crate::test_helpers::blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let b = svc
            .create_blob_for_user(
                &owner_p,
                CreateBlob {
                    owner: None,
                    file_type: FileType::SVG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await
            .expect("svg ok");
        assert_eq!(b.file_type, FileType::SVG);
    }

    /// BLC-BLOB-010: two users each see only blobs from teams they can read.
    #[tokio::test]
    async fn blc_blob_010_list_visibility_isolation() {
        use shared::api::ListQuery;
        let blob_dir = tempfile::tempdir().expect("tempdir");
        let (db, owner, _cm, _guest, non_member, _tid) = four_user_blob_fixture().await;
        let svc =
            crate::test_helpers::blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let nm_p = auth_ctx_for_user(&db, &non_member).await.expect("auth");
        let b = svc
            .create_blob_for_user(
                &owner_p,
                CreateBlob {
                    owner: None,
                    file_type: FileType::PNG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await
            .expect("create");
        let owner_list = svc
            .list_blobs_for_user(&owner_p, ListQuery::default())
            .await
            .expect("owner list");
        assert!(owner_list.iter().any(|x| x.id == b.id));
        let nm_list = svc
            .list_blobs_for_user(&nm_p, ListQuery::default())
            .await
            .expect("nm list");
        assert!(!nm_list.iter().any(|x| x.id == b.id));
    }

    /// PATCH-BLOB-001: patch only ocr; file_type, width, height remain unchanged.
    #[tokio::test]
    async fn patch_blob_ocr_only_leaves_dimensions_unchanged() {
        use shared::blob::{FileType, PatchBlob};

        use crate::test_helpers::{
            blob_service, configure_personal_team_members, create_user, personal_team_id, test_db,
        };

        let blob_dir = tempfile::tempdir().expect("tempdir");
        let db = test_db().await.expect("db");
        let svc = blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner = create_user(&db, "blob-patch-owner@test.local")
            .await
            .expect("u");
        let _team_id = personal_team_id(&db, &owner).await.expect("team");
        configure_personal_team_members(&db, &owner, &_team_id, vec![])
            .await
            .expect("acl");

        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let blob = svc
            .create_blob_for_user(
                &owner_p,
                CreateBlob {
                    owner: None,
                    file_type: FileType::PNG,
                    width: 100,
                    height: 200,
                    ocr: "original".into(),
                },
            )
            .await
            .expect("create");

        let patched = svc
            .patch_blob_for_user(
                &owner_p,
                &blob.id,
                PatchBlob {
                    file_type: None,
                    width: None,
                    height: None,
                    ocr: Some("updated".into()),
                },
            )
            .await
            .expect("patch");

        assert_eq!(patched.ocr, "updated");
        assert_eq!(
            patched.file_type, blob.file_type,
            "file_type must be unchanged"
        );
        assert_eq!(patched.width, blob.width, "width must be unchanged");
        assert_eq!(patched.height, blob.height, "height must be unchanged");
    }

    /// PATCH-BLOB-002: PATCH on a non-existent blob returns NotFound.
    #[tokio::test]
    async fn patch_blob_not_found() {
        use shared::blob::PatchBlob;

        let user = test_user();
        let svc = BlobService::new(MockBlobRepo { blobs: vec![] }, NullStorage);
        let ctx = auth_ctx_test_personal_team(&user);
        let r = svc
            .patch_blob_for_user(
                &ctx,
                "missing",
                PatchBlob {
                    file_type: None,
                    width: None,
                    height: None,
                    ocr: Some("x".into()),
                },
            )
            .await;
        assert!(matches!(r, Err(crate::error::AppError::NotFound(_))));
    }

    #[tokio::test]
    async fn patch_blob_all_field_combinations() {
        use crate::test_helpers::{auth_ctx_for_user, blob_service, create_user, test_db};
        use shared::blob::{FileType, PatchBlob};

        let blob_dir = tempfile::tempdir().expect("tempdir");
        let db = test_db().await.expect("db");
        let svc = blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let owner = create_user(&db, "blob-patch-combos@test.local")
            .await
            .expect("owner");
        let perms = auth_ctx_for_user(&db, &owner).await.expect("auth");

        for mask in 0u8..16 {
            let include_file_type = (mask & 0b0001) != 0;
            let include_width = (mask & 0b0010) != 0;
            let include_height = (mask & 0b0100) != 0;
            let include_ocr = (mask & 0b1000) != 0;
            let created = svc
                .create_blob_for_user(
                    &perms,
                    CreateBlob {
                        owner: None,
                        file_type: FileType::PNG,
                        width: 100,
                        height: 200,
                        ocr: "base".into(),
                    },
                )
                .await
                .expect("create");

            let patched = svc
                .patch_blob_for_user(
                    &perms,
                    &created.id,
                    PatchBlob {
                        file_type: include_file_type.then_some(FileType::JPEG),
                        width: include_width.then_some(111),
                        height: include_height.then_some(222),
                        ocr: include_ocr.then_some("patched".into()),
                    },
                )
                .await
                .expect("patch");

            let expected_file_type = if include_file_type {
                FileType::JPEG
            } else {
                FileType::PNG
            };
            let expected_width = if include_width { 111 } else { 100 };
            let expected_height = if include_height { 222 } else { 200 };
            let expected_ocr = if include_ocr { "patched" } else { "base" };

            assert_eq!(
                patched.file_type, expected_file_type,
                "mask={mask:04b}: file_type mismatch"
            );
            assert_eq!(
                patched.width, expected_width,
                "mask={mask:04b}: width mismatch"
            );
            assert_eq!(
                patched.height, expected_height,
                "mask={mask:04b}: height mismatch"
            );
            assert_eq!(patched.ocr, expected_ocr, "mask={mask:04b}: ocr mismatch");
        }
    }

    /// BLC-BLOB-017–018: move between shared teams and idempotent same-owner.
    #[tokio::test]
    async fn blc_blob_017_move_between_teams_and_idempotent() {
        use crate::test_helpers::{
            auth_ctx_for_user, blob_service, create_user, test_db, two_shared_teams_for_user,
        };
        use shared::MoveOwner;

        let blob_dir = tempfile::tempdir().expect("tempdir");
        let db = test_db().await.expect("db");
        let svc = blob_service(&db, blob_dir.path().to_string_lossy().into_owned());
        let mover = create_user(&db, "blob-move@test.local")
            .await
            .expect("mover");
        let (team_a, team_b) = two_shared_teams_for_user(&db, &mover).await.expect("teams");
        let p = auth_ctx_for_user(&db, &mover).await.expect("auth");

        let b = svc
            .create_blob_for_user(
                &p,
                CreateBlob {
                    owner: Some(team_a.clone()),
                    file_type: FileType::PNG,
                    width: 1,
                    height: 1,
                    ocr: String::new(),
                },
            )
            .await
            .expect("create");
        assert_eq!(b.owner, team_a);

        let on_b = svc
            .move_blob_for_user(
                &p,
                &b.id,
                MoveOwner {
                    owner: team_b.clone(),
                },
            )
            .await
            .expect("to B");
        assert_eq!(on_b.owner, team_b);

        let idem = svc
            .move_blob_for_user(
                &p,
                &b.id,
                MoveOwner {
                    owner: team_b.clone(),
                },
            )
            .await
            .expect("idem");
        assert_eq!(idem.owner, team_b);
    }
}
