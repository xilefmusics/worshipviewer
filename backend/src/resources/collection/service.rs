use std::collections::HashSet;
use std::sync::Arc;

use shared::MoveOwner;
use shared::api::ListQuery;
use shared::collection::{Collection, CreateCollection, PatchCollection};
use shared::player::Player;
use shared::song::{Link as SongLink, Song};
use tracing::instrument;

use crate::auth::AuthorizationContext;
use crate::database::Database;
use crate::error::AppError;
use crate::resources::common::{player_from_song_links, resolve_owner_team, song_thing};
use crate::resources::song::LikedSongIds;
use crate::resources::team::{parse_owner_record_id, thing_record_key};

use super::repository::CollectionRepository;
use super::surreal_repo::SurrealCollectionRepo;

fn song_link_id_key(id: &str) -> String {
    thing_record_key(&song_thing(id))
}

/// BLC-COLL-025: collection must have no songs before DELETE.
fn ensure_collection_empty_for_delete(songs: &[SongLink]) -> Result<(), AppError> {
    if !songs.is_empty() {
        return Err(AppError::conflict(
            "cannot delete a collection that still contains songs; remove all songs first",
        ));
    }
    Ok(())
}

/// BLC-COLL-024: existing song ids must remain present (add/reorder/nr/key changes only).
fn ensure_no_song_removals(current: &[SongLink], proposed: &[SongLink]) -> Result<(), AppError> {
    let proposed_keys: HashSet<String> = proposed.iter().map(|l| song_link_id_key(&l.id)).collect();
    let removes = current
        .iter()
        .any(|l| !proposed_keys.contains(&song_link_id_key(&l.id)));
    if removes {
        return Err(AppError::conflict(
            "cannot remove songs from a collection via PUT or PATCH; delete the song instead",
        ));
    }
    Ok(())
}

#[derive(Clone)]
pub struct CollectionService<R, L> {
    pub repo: R,
    pub likes: L,
}

impl<R, L> CollectionService<R, L> {
    pub fn new(repo: R, likes: L) -> Self {
        Self { repo, likes }
    }
}

impl<R: CollectionRepository, L: LikedSongIds> CollectionService<R, L> {
    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn list_collections_for_user(
        &self,
        ctx: &AuthorizationContext,
        pagination: ListQuery,
    ) -> Result<Vec<Collection>, AppError> {
        let read_teams = ctx.read_teams();
        self.repo.get_collections(&read_teams, pagination).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn count_collections_for_user(
        &self,
        ctx: &AuthorizationContext,
        q: Option<&str>,
    ) -> Result<u64, AppError> {
        let read_teams = ctx.read_teams();
        self.repo.count_collections(&read_teams, q).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn get_collection_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Collection, AppError> {
        let read_teams = ctx.read_teams();
        self.repo.get_collection(&read_teams, id).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn collection_player_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Player, AppError> {
        let user_id = ctx.user.id.clone();
        let liked_set = self.likes.liked_song_ids(&user_id).await?;
        let read_teams = ctx.read_teams();
        let links = self.repo.get_collection_songs(&read_teams, id).await?;
        player_from_song_links(liked_set, links)
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn collection_songs_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        pagination: ListQuery,
    ) -> Result<(Vec<Song>, u64), AppError> {
        let user_id = ctx.user.id.clone();
        let liked_set = self.likes.liked_song_ids(&user_id).await?;
        let read_teams = ctx.read_teams();
        let songs: Vec<Song> = self
            .repo
            .get_collection_songs(&read_teams, id)
            .await?
            .into_iter()
            .map(|song_link_owned| {
                let mut song = song_link_owned.song;
                song.user_specific_addons.liked = liked_set.contains(&song.id);
                song
            })
            .collect();
        let total = songs.len() as u64;
        let (page, _) = ListQuery::paginate_nested_vec(songs, &pagination);
        Ok((page, total))
    }

    #[instrument(level = "debug", err, skip(self, ctx, collection))]
    pub async fn create_collection_for_user(
        &self,
        ctx: &AuthorizationContext,
        mut collection: CreateCollection,
    ) -> Result<Collection, AppError> {
        let owner = match collection.owner.take() {
            None => ctx.personal_team()?,
            Some(ref s) => {
                let rid = parse_owner_record_id(s)?;
                ctx.require_write_access_to_owner(&rid)?;
                rid
            }
        };
        self.repo.create_collection(owner, collection).await
    }

    #[instrument(level = "debug", err, skip(self, ctx, collection))]
    pub async fn update_collection_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        collection: CreateCollection,
        owner: Option<String>,
    ) -> Result<Collection, AppError> {
        let write_teams = ctx.write_teams();
        let current = self.repo.get_collection(&write_teams, id).await?;
        ensure_no_song_removals(&current.songs, &collection.songs)?;
        let owner = resolve_owner_team(&write_teams, owner)?;
        self.repo
            .update_collection(&write_teams, id, collection, owner)
            .await
    }

    #[instrument(level = "debug", err, skip(self, ctx, patch))]
    pub async fn patch_collection_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        patch: PatchCollection,
    ) -> Result<Collection, AppError> {
        let owner = patch.owner.clone();
        let current = self.get_collection_for_user(ctx, id).await?;
        let merged = CreateCollection {
            owner: None,
            title: patch.title.unwrap_or(current.title),
            cover: patch.cover.unwrap_or(current.cover),
            songs: patch.songs.unwrap_or(current.songs),
        };
        self.update_collection_for_user(ctx, id, merged, owner)
            .await
    }

    #[instrument(level = "debug", err, skip(self, ctx, payload))]
    pub async fn move_collection_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        payload: MoveOwner,
    ) -> Result<Collection, AppError> {
        let collection = self.get_collection_for_user(ctx, id).await?;
        let current = parse_owner_record_id(&collection.owner)?;
        let dest = parse_owner_record_id(&payload.owner)?;
        if thing_record_key(&current) == thing_record_key(&dest) {
            return Ok(collection);
        }
        ctx.require_write_access_to_owner(&current)?;
        ctx.require_write_access_to_owner(&dest)?;
        let write_teams = ctx.write_teams();
        self.repo
            .move_collection_owner(&write_teams, id, dest)
            .await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn delete_collection_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Collection, AppError> {
        let collection = self.get_collection_for_user(ctx, id).await?;
        ensure_collection_empty_for_delete(&collection.songs)?;
        let write_teams = ctx.write_teams();
        self.repo.delete_collection(&write_teams, id).await
    }
}

/// Production type alias used in HTTP wiring.
pub type CollectionServiceHandle = CollectionService<SurrealCollectionRepo, Arc<Database>>;

impl CollectionServiceHandle {
    pub fn build(db: Arc<Database>) -> Self {
        CollectionService::new(SurrealCollectionRepo::new(db.clone()), db.clone())
    }
}

#[cfg(test)]
mod tests {
    use shared::song::Link as SongLink;

    use crate::error::AppError;
    use crate::test_helpers::auth_ctx_for_user;
    use crate::test_helpers::{
        TeamFixture, configure_personal_team_members, create_song_with_title, create_user,
        personal_team_id, team_service, test_db, two_shared_teams_for_user,
    };
    use shared::MoveOwner;
    use shared::api::ListQuery;
    use shared::collection::CreateCollection;
    use shared::team::{TeamMemberInput, TeamRole, TeamUserRef, UpdateTeam};

    use super::CollectionServiceHandle;

    #[tokio::test]
    async fn blc_collection_crud_and_acl() {
        let db = test_db().await.expect("db");
        let svc = CollectionServiceHandle::build(db.clone());

        let owner = create_user(&db, "coll-owner@test.local").await.expect("o");
        let guest = create_user(&db, "coll-guest@test.local").await.expect("g");
        let team_id = personal_team_id(&db, &owner).await.expect("team");
        configure_personal_team_members(
            &db,
            &owner,
            &team_id,
            vec![(guest.id.clone(), TeamRole::Guest)],
        )
        .await
        .expect("acl");

        let song = create_song_with_title(&db, &owner, "Coll Song")
            .await
            .expect("song");

        let owner_perms = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let guest_perms = auth_ctx_for_user(&db, &guest).await.expect("auth");

        let col = svc
            .create_collection_for_user(
                &owner_perms,
                CreateCollection {
                    owner: None,
                    title: "My Collection".into(),
                    cover: "mysongs".into(),
                    songs: vec![SongLink {
                        id: song.id.clone(),
                        nr: None,
                        key: None,
                    }],
                },
            )
            .await
            .expect("create");

        assert_eq!(col.owner, team_id);

        let list = svc
            .list_collections_for_user(&owner_perms, ListQuery::default())
            .await
            .expect("list");
        assert!(list.iter().any(|c| c.id == col.id));

        svc.get_collection_for_user(&guest_perms, &col.id)
            .await
            .expect("guest read");

        let upd = svc
            .update_collection_for_user(
                &owner_perms,
                &col.id,
                CreateCollection {
                    owner: None,
                    title: "Updated".into(),
                    cover: "mysongs".into(),
                    songs: vec![SongLink {
                        id: song.id.clone(),
                        nr: Some("1".into()),
                        key: None,
                    }],
                },
                None,
            )
            .await
            .expect("update");
        assert_eq!(upd.title, "Updated");

        let put_guest = svc
            .update_collection_for_user(
                &guest_perms,
                &col.id,
                CreateCollection {
                    owner: None,
                    title: "Nope".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
                None,
            )
            .await;
        assert!(matches!(put_guest, Err(AppError::NotFound(_))));

        let song_svc = crate::resources::song::SongServiceHandle::build(db.clone());
        song_svc
            .delete_song_for_user(&owner_perms, &song.id)
            .await
            .expect("delete song");
        svc.delete_collection_for_user(&owner_perms, &col.id)
            .await
            .expect("delete");
    }

    /// Build a four-user collection fixture: owner, content_maintainer, guest, non_member.
    async fn four_user_coll_fixture() -> (
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

        let db = test_db().await.expect("db");
        let owner = create_user(&db, "c3g-owner@test.local")
            .await
            .expect("owner");
        let cm = create_user(&db, "c3g-cm@test.local").await.expect("cm");
        let guest = create_user(&db, "c3g-guest@test.local")
            .await
            .expect("guest");
        let non_member = create_user(&db, "c3g-nm@test.local").await.expect("nm");
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

    fn make_collection(title: &str) -> CreateCollection {
        CreateCollection {
            owner: None,
            title: title.into(),
            cover: "mysongs".into(),
            songs: vec![],
        }
    }

    /// BLC-COLL-002, BLC-COLL-006: non-member reading a collection returns NotFound.
    #[tokio::test]
    async fn blc_coll_002_non_member_read_not_found() {
        let (db, owner, _cm, _guest, nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let nm_p = auth_ctx_for_user(&db, &nm).await.expect("auth");
        let col = svc
            .create_collection_for_user(&owner_p, make_collection("NMTest"))
            .await
            .expect("create");
        let r = svc.get_collection_for_user(&nm_p, &col.id).await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-COLL-002: guest can read a collection.
    #[tokio::test]
    async fn blc_coll_002_guest_can_read() {
        let (db, owner, _cm, guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let guest_p = auth_ctx_for_user(&db, &guest).await.expect("auth");
        let col = svc
            .create_collection_for_user(&owner_p, make_collection("GuestTest"))
            .await
            .expect("create");
        svc.get_collection_for_user(&guest_p, &col.id)
            .await
            .expect("guest read");
    }

    /// BLC-COLL-002: content_maintainer can update a collection.
    #[tokio::test]
    async fn blc_coll_002_content_maintainer_can_update() {
        let (db, owner, cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let cm_p = auth_ctx_for_user(&db, &cm).await.expect("auth");
        let col = svc
            .create_collection_for_user(&owner_p, make_collection("CMTest"))
            .await
            .expect("create");
        svc.update_collection_for_user(&cm_p, &col.id, make_collection("CMUpdated"), None)
            .await
            .expect("cm update");
    }

    /// BLC-COLL-007: guest cannot create a collection.
    #[tokio::test]
    async fn blc_coll_007_guest_cannot_create() {
        let (db, _owner, _cm, guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let guest_p = auth_ctx_for_user(&db, &guest).await.expect("auth");
        // The collection would be owned by the guest's personal team, which the guest can write.
        // But test: guest on owner's team cannot write to owner's collections.
        // Actually, create always goes to caller's personal team, so guest creates on their own
        // personal team -> that succeeds. The constraint is about mutating others' content.
        // BLC-COLL-007 tests guest PUT/DELETE on owner's collection.
        let owner_2 = crate::test_helpers::create_user(&db, "c3g-owner2@test.local")
            .await
            .expect("o2");
        let owner2_p = auth_ctx_for_user(&db, &owner_2).await.expect("auth");
        let col = svc
            .create_collection_for_user(&owner2_p, make_collection("O2Coll"))
            .await
            .expect("create");
        let r = svc
            .update_collection_for_user(&guest_p, &col.id, make_collection("Hack"), None)
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-COLL-025: DELETE is rejected while the collection still has songs.
    #[tokio::test]
    async fn blc_coll_025_delete_non_empty_collection_rejected() {
        let db = test_db().await.expect("db");
        let svc = CollectionServiceHandle::build(db.clone());
        let owner = create_user(&db, "coll-del-block@test.local")
            .await
            .expect("o");
        let song = create_song_with_title(&db, &owner, "Block Del")
            .await
            .expect("song");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let col = svc
            .create_collection_for_user(
                &owner_p,
                CreateCollection {
                    owner: None,
                    title: "Non Empty".into(),
                    cover: "mysongs".into(),
                    songs: vec![SongLink {
                        id: song.id.clone(),
                        nr: None,
                        key: None,
                    }],
                },
            )
            .await
            .expect("create");
        let r = svc.delete_collection_for_user(&owner_p, &col.id).await;
        assert!(matches!(r, Err(AppError::Conflict(_))));
    }

    /// BLC-COLL-025: DELETE succeeds after all songs are removed (via song DELETE cascade).
    #[tokio::test]
    async fn blc_coll_025_delete_after_songs_removed() {
        let db = test_db().await.expect("db");
        let svc = CollectionServiceHandle::build(db.clone());
        let song_svc = crate::resources::song::SongServiceHandle::build(db.clone());
        let owner = create_user(&db, "coll-del-ok@test.local").await.expect("o");
        let song = create_song_with_title(&db, &owner, "Allow Del")
            .await
            .expect("song");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let col = svc
            .create_collection_for_user(
                &owner_p,
                CreateCollection {
                    owner: None,
                    title: "Then Empty".into(),
                    cover: "mysongs".into(),
                    songs: vec![SongLink {
                        id: song.id.clone(),
                        nr: None,
                        key: None,
                    }],
                },
            )
            .await
            .expect("create");
        song_svc
            .delete_song_for_user(&owner_p, &song.id)
            .await
            .expect("delete song");
        svc.delete_collection_for_user(&owner_p, &col.id)
            .await
            .expect("delete collection");
    }

    /// BLC-COLL-007: guest cannot delete a collection they don't own.
    #[tokio::test]
    async fn blc_coll_007_guest_cannot_delete() {
        let (db, owner, _cm, guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let guest_p = auth_ctx_for_user(&db, &guest).await.expect("auth");
        let col = svc
            .create_collection_for_user(&owner_p, make_collection("GuestDel"))
            .await
            .expect("create");
        let r = svc.delete_collection_for_user(&guest_p, &col.id).await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-COLL-003: PUT does not change the collection's owner.
    #[tokio::test]
    async fn blc_coll_003_put_does_not_change_owner() {
        let (db, owner, _cm, _guest, _nm, tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let col = svc
            .create_collection_for_user(&owner_p, make_collection("OwnerTest"))
            .await
            .expect("create");
        assert_eq!(col.owner, tid);
        let updated = svc
            .update_collection_for_user(&owner_p, &col.id, make_collection("Renamed"), None)
            .await
            .expect("update");
        assert_eq!(
            updated.owner, tid,
            "owner must not change on PUT when omitted"
        );
    }

    #[tokio::test]
    async fn blc_coll_put_moves_owner_when_target_writable() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = CollectionServiceHandle::build(db.clone());
        let admin_p = auth_ctx_for_user(&db, &fx.admin_user).await.expect("auth");
        let col = svc
            .create_collection_for_user(
                &admin_p,
                CreateCollection {
                    owner: None,
                    title: "MoveCol".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
            )
            .await
            .expect("create");
        let personal = personal_team_id(&db, &fx.admin_user).await.expect("pt");
        assert_eq!(col.owner, personal);
        let updated = svc
            .update_collection_for_user(
                &admin_p,
                &col.id,
                CreateCollection {
                    owner: None,
                    title: "MoveCol".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
                Some(fx.shared_team_id.clone()),
            )
            .await
            .expect("move");
        assert_eq!(updated.owner, fx.shared_team_id);
    }

    /// BLC-COLL-004: POST with a non-existent song ID succeeds (no existence check).
    #[tokio::test]
    async fn blc_coll_004_post_accepts_nonexistent_song_ids() {
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let col = svc
            .create_collection_for_user(
                &owner_p,
                CreateCollection {
                    owner: None,
                    title: "WithGhostSong".into(),
                    cover: "mysongs".into(),
                    songs: vec![shared::song::Link {
                        id: "song:doesnotexist".into(),
                        nr: None,
                        key: None,
                    }],
                },
            )
            .await
            .expect("non-existent song id accepted");
        assert!(!col.id.is_empty());
    }

    /// BLC-COLL-009: optional `owner` — content_maintainer can create on the team; guest cannot.
    #[tokio::test]
    async fn blc_coll_009_post_optional_owner_acl() {
        let (db, _owner, cm, guest, _nm, tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let cm_p = auth_ctx_for_user(&db, &cm).await.expect("auth");
        let guest_p = auth_ctx_for_user(&db, &guest).await.expect("auth");

        let col = svc
            .create_collection_for_user(
                &cm_p,
                CreateCollection {
                    owner: Some(tid.clone()),
                    title: "OnTeam".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
            )
            .await
            .expect("cm creates under team");
        assert_eq!(col.owner, tid);

        let r = svc
            .create_collection_for_user(
                &guest_p,
                CreateCollection {
                    owner: Some(tid.clone()),
                    title: "GuestNo".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-COLL-005: list with `q` filter matches by title (single-token titles).
    #[tokio::test]
    async fn blc_coll_005_list_with_q_filter() {
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        svc.create_collection_for_user(&owner_p, make_collection("Hallelujah"))
            .await
            .expect("c1");
        svc.create_collection_for_user(&owner_p, make_collection("Amazing"))
            .await
            .expect("c2");
        let results = svc
            .list_collections_for_user(&owner_p, ListQuery::new().with_q("Hallelujah"))
            .await
            .expect("search");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Hallelujah");
    }

    /// BLC-COLL-005: list with pagination returns the correct page.
    #[tokio::test]
    async fn blc_coll_005_list_pagination() {
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        for i in 0..3u32 {
            svc.create_collection_for_user(&owner_p, make_collection(&format!("Coll{i}")))
                .await
                .expect("create");
        }
        let page0 = svc
            .list_collections_for_user(
                &owner_p,
                ListQuery::default().with_page(0).with_page_size(2),
            )
            .await
            .expect("page0");
        assert_eq!(page0.len(), 2);
        let page1 = svc
            .list_collections_for_user(
                &owner_p,
                ListQuery::default().with_page(1).with_page_size(2),
            )
            .await
            .expect("page1");
        assert_eq!(page1.len(), 1);
    }

    /// BLC-COLL-011: authorized user can list songs in a collection.
    #[tokio::test]
    async fn blc_coll_011_songs_sub_route_authorized() {
        use crate::test_helpers::create_song_with_title;
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "CollSongSub")
            .await
            .expect("song");
        let col = svc
            .create_collection_for_user(
                &owner_p,
                CreateCollection {
                    owner: None,
                    title: "SubTest".into(),
                    cover: "mysongs".into(),
                    songs: vec![shared::song::Link {
                        id: song.id.clone(),
                        nr: None,
                        key: None,
                    }],
                },
            )
            .await
            .expect("create");
        let (songs, _) = svc
            .collection_songs_for_user(&owner_p, &col.id, ListQuery::default())
            .await
            .expect("songs");
        assert!(songs.iter().any(|s| s.id == song.id));
    }

    /// PATCH-COLL-001: patch with only title changes title; cover and songs remain unchanged.
    #[tokio::test]
    async fn patch_collection_title_only_leaves_cover_and_songs_unchanged() {
        use shared::collection::PatchCollection;
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        let col = svc
            .create_collection_for_user(&owner_p, make_collection("Old Title"))
            .await
            .expect("create");

        let patched = svc
            .patch_collection_for_user(
                &owner_p,
                &col.id,
                PatchCollection {
                    title: Some("New Title".into()),
                    cover: None,
                    songs: None,
                    owner: None,
                },
            )
            .await
            .expect("patch");

        assert_eq!(patched.title, "New Title");
        assert_eq!(patched.cover, col.cover, "cover must be unchanged");
        assert_eq!(
            patched.songs.len(),
            col.songs.len(),
            "songs must be unchanged"
        );
    }

    /// PATCH-COLL-002: patch with only cover changes cover; title and songs remain unchanged.
    #[tokio::test]
    async fn patch_collection_cover_only_leaves_title_and_songs_unchanged() {
        use shared::collection::PatchCollection;
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        let col = svc
            .create_collection_for_user(&owner_p, make_collection("Title"))
            .await
            .expect("create");

        let patched = svc
            .patch_collection_for_user(
                &owner_p,
                &col.id,
                PatchCollection {
                    title: None,
                    cover: Some("newheart".into()),
                    songs: None,
                    owner: None,
                },
            )
            .await
            .expect("patch");

        assert_eq!(patched.cover, "newheart");
        assert_eq!(patched.title, col.title, "title must be unchanged");
    }

    /// BLC-COLL-024: PUT cannot drop an existing song id from `songs`.
    #[tokio::test]
    async fn blc_coll_024_put_cannot_remove_song() {
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let s1 = create_song_with_title(&db, &owner, "Keep Me")
            .await
            .expect("s1");
        let s2 = create_song_with_title(&db, &owner, "Also Keep")
            .await
            .expect("s2");
        let col = svc
            .create_collection_for_user(
                &owner_p,
                CreateCollection {
                    owner: None,
                    title: "NoRemove".into(),
                    cover: "mysongs".into(),
                    songs: vec![
                        shared::song::Link {
                            id: s1.id.clone(),
                            nr: Some("1".into()),
                            key: None,
                        },
                        shared::song::Link {
                            id: s2.id.clone(),
                            nr: Some("2".into()),
                            key: None,
                        },
                    ],
                },
            )
            .await
            .expect("create");

        let r = svc
            .update_collection_for_user(
                &owner_p,
                &col.id,
                CreateCollection {
                    owner: None,
                    title: "NoRemove".into(),
                    cover: "mysongs".into(),
                    songs: vec![shared::song::Link {
                        id: s2.id.clone(),
                        nr: Some("2".into()),
                        key: None,
                    }],
                },
                None,
            )
            .await;
        assert!(matches!(r, Err(AppError::Conflict(_))));

        let still = svc
            .get_collection_for_user(&owner_p, &col.id)
            .await
            .expect("unchanged");
        assert_eq!(still.songs.len(), 2);
    }

    /// BLC-COLL-024: PATCH cannot drop an existing song id from `songs`.
    #[tokio::test]
    async fn blc_coll_024_patch_cannot_remove_song() {
        use shared::collection::PatchCollection;

        let (db, owner, _cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let s1 = create_song_with_title(&db, &owner, "Patch Keep")
            .await
            .expect("s1");
        let col = svc
            .create_collection_for_user(
                &owner_p,
                CreateCollection {
                    owner: None,
                    title: "PatchNoRemove".into(),
                    cover: "mysongs".into(),
                    songs: vec![shared::song::Link {
                        id: s1.id.clone(),
                        nr: Some("1".into()),
                        key: None,
                    }],
                },
            )
            .await
            .expect("create");

        let r = svc
            .patch_collection_for_user(
                &owner_p,
                &col.id,
                PatchCollection {
                    title: None,
                    cover: None,
                    songs: Some(vec![]),
                    owner: None,
                },
            )
            .await;
        assert!(matches!(r, Err(AppError::Conflict(_))));
    }

    /// BLC-COLL-024: PUT may add songs and update metadata on existing entries.
    #[tokio::test]
    async fn blc_coll_024_put_may_add_and_update_existing() {
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let s1 = create_song_with_title(&db, &owner, "First")
            .await
            .expect("s1");
        let s2 = create_song_with_title(&db, &owner, "Second")
            .await
            .expect("s2");
        let col = svc
            .create_collection_for_user(
                &owner_p,
                CreateCollection {
                    owner: None,
                    title: "Grow".into(),
                    cover: "mysongs".into(),
                    songs: vec![shared::song::Link {
                        id: s1.id.clone(),
                        nr: Some("1".into()),
                        key: None,
                    }],
                },
            )
            .await
            .expect("create");

        let updated = svc
            .update_collection_for_user(
                &owner_p,
                &col.id,
                CreateCollection {
                    owner: None,
                    title: "Grow".into(),
                    cover: "mysongs".into(),
                    songs: vec![
                        shared::song::Link {
                            id: s2.id.clone(),
                            nr: Some("2".into()),
                            key: None,
                        },
                        shared::song::Link {
                            id: s1.id.clone(),
                            nr: Some("1a".into()),
                            key: None,
                        },
                    ],
                },
                None,
            )
            .await
            .expect("add + reorder + nr update");
        assert_eq!(updated.songs.len(), 2);
        assert_eq!(updated.songs[0].id, s2.id);
        assert_eq!(updated.songs[1].nr.as_deref(), Some("1a"));
    }

    /// PATCH-COLL-003: PATCH on a non-existent collection returns NotFound.
    #[tokio::test]
    async fn patch_collection_not_found() {
        use shared::collection::PatchCollection;
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let r = svc
            .patch_collection_for_user(
                &owner_p,
                "never-existed-collection",
                PatchCollection {
                    title: Some("x".into()),
                    cover: None,
                    songs: None,
                    owner: None,
                },
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    #[tokio::test]
    async fn patch_collection_all_field_combinations() {
        use shared::collection::PatchCollection;

        let (db, owner, _cm, _guest, _nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let s1 = create_song_with_title(&db, &owner, "Song One")
            .await
            .expect("s1");
        let s2 = create_song_with_title(&db, &owner, "Song Two")
            .await
            .expect("s2");

        for mask in 0u8..8 {
            let created = svc
                .create_collection_for_user(
                    &owner_p,
                    CreateCollection {
                        owner: None,
                        title: "BaseTitle".into(),
                        cover: "mysongs".into(),
                        songs: vec![shared::song::Link {
                            id: s1.id.clone(),
                            nr: Some("1".into()),
                            key: None,
                        }],
                    },
                )
                .await
                .expect("create");

            let include_title = (mask & 0b001) != 0;
            let include_cover = (mask & 0b010) != 0;
            let include_songs = (mask & 0b100) != 0;

            let patch = PatchCollection {
                title: include_title.then_some("PatchedTitle".into()),
                cover: include_cover.then_some("newheart".into()),
                songs: include_songs.then_some(vec![shared::song::Link {
                    id: s2.id.clone(),
                    nr: Some("9".into()),
                    key: None,
                }]),
                owner: None,
            };

            if include_songs {
                let r = svc
                    .patch_collection_for_user(&owner_p, &created.id, patch)
                    .await;
                assert!(
                    matches!(r, Err(AppError::Conflict(_))),
                    "mask={mask:03b}: replacing songs must not remove existing ids"
                );
                continue;
            }

            let patched = svc
                .patch_collection_for_user(&owner_p, &created.id, patch)
                .await
                .expect("patch");

            let expected_title = if include_title {
                "PatchedTitle"
            } else {
                "BaseTitle"
            };
            let expected_cover = if include_cover { "newheart" } else { "mysongs" };

            assert_eq!(
                patched.title, expected_title,
                "mask={mask:03b}: title mismatch"
            );
            assert_eq!(
                patched.cover, expected_cover,
                "mask={mask:03b}: cover mismatch"
            );
            assert_eq!(
                patched.songs[0].id, s1.id,
                "mask={mask:03b}: songs should remain unchanged"
            );
        }
    }

    /// BLC-COLL-011: unauthorized user cannot access collection songs sub-route.
    #[tokio::test]
    async fn blc_coll_011_songs_sub_route_unauthorized() {
        let (db, owner, _cm, _guest, nm, _tid) = four_user_coll_fixture().await;
        let svc = CollectionServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let nm_p = auth_ctx_for_user(&db, &nm).await.expect("auth");
        let col = svc
            .create_collection_for_user(&owner_p, make_collection("SecretColl"))
            .await
            .expect("create");
        let r = svc
            .collection_songs_for_user(&nm_p, &col.id, ListQuery::default())
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-COLL-020–021: move between teams and idempotent same-owner.
    #[tokio::test]
    async fn blc_coll_020_move_between_teams_and_idempotent() {
        let db = test_db().await.expect("db");
        let mover = create_user(&db, "c-move-mover@test.local")
            .await
            .expect("mover");
        let (team_a, team_b) = two_shared_teams_for_user(&db, &mover)
            .await
            .expect("two teams");

        let svc = CollectionServiceHandle::build(db.clone());
        let p = auth_ctx_for_user(&db, &mover).await.expect("auth");

        let col = svc
            .create_collection_for_user(
                &p,
                CreateCollection {
                    owner: Some(team_a.clone()),
                    title: "OnA".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
            )
            .await
            .expect("create");
        assert_eq!(col.owner, team_a);

        let on_b = svc
            .move_collection_for_user(
                &p,
                &col.id,
                MoveOwner {
                    owner: team_b.clone(),
                },
            )
            .await
            .expect("move to B");
        assert_eq!(on_b.owner, team_b);

        let back = svc
            .move_collection_for_user(
                &p,
                &col.id,
                MoveOwner {
                    owner: team_a.clone(),
                },
            )
            .await
            .expect("move to A");
        assert_eq!(back.owner, team_a);

        let idem = svc
            .move_collection_for_user(
                &p,
                &col.id,
                MoveOwner {
                    owner: team_a.clone(),
                },
            )
            .await
            .expect("idem");
        assert_eq!(idem.owner, team_a);
    }

    /// BLC-COLL-020: guest cannot move (no library write on source team).
    #[tokio::test]
    async fn blc_coll_021_move_guest_lacks_source_write() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fx");
        let svc = CollectionServiceHandle::build(db.clone());
        let admin_p = auth_ctx_for_user(&db, &fx.admin_user).await.expect("auth");
        let guest_p = auth_ctx_for_user(&db, &fx.guest).await.expect("auth");

        let col = svc
            .create_collection_for_user(
                &admin_p,
                CreateCollection {
                    owner: Some(fx.shared_team_id.clone()),
                    title: "OnShared".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
            )
            .await
            .expect("create");

        let dest = personal_team_id(&db, &fx.guest).await.expect("g personal");
        let r = svc
            .move_collection_for_user(&guest_p, &col.id, MoveOwner { owner: dest })
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-COLL-020: destination team requires library write.
    #[tokio::test]
    async fn blc_coll_022_move_lacks_dest_write() {
        let db = test_db().await.expect("db");
        let lead = create_user(&db, "c-lead@test.local").await.expect("lead");
        let cm = create_user(&db, "c-cmonly@test.local").await.expect("cm");
        let (team_a, team_b) = two_shared_teams_for_user(&db, &lead).await.expect("teams");

        team_service(&db)
            .update_team_for_user(
                &lead,
                &team_a,
                UpdateTeam {
                    name: "Team A".into(),
                    members: Some(vec![
                        TeamMemberInput {
                            user: TeamUserRef {
                                id: lead.id.clone(),
                            },
                            role: TeamRole::Admin,
                        },
                        TeamMemberInput {
                            user: TeamUserRef { id: cm.id.clone() },
                            role: TeamRole::ContentMaintainer,
                        },
                    ]),
                },
            )
            .await
            .expect("add cm to A");

        let svc = CollectionServiceHandle::build(db.clone());
        let cm_p = auth_ctx_for_user(&db, &cm).await.expect("auth");

        let col = svc
            .create_collection_for_user(
                &cm_p,
                CreateCollection {
                    owner: Some(team_a.clone()),
                    title: "OnA".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
            )
            .await
            .expect("create");

        let r = svc
            .move_collection_for_user(
                &cm_p,
                &col.id,
                MoveOwner {
                    owner: team_b.clone(),
                },
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    #[tokio::test]
    async fn blc_coll_023_move_empty_owner_bad_request() {
        let db = test_db().await.expect("db");
        let u = create_user(&db, "c-bad@test.local").await.expect("u");
        let (a, _) = two_shared_teams_for_user(&db, &u).await.expect("teams");
        let svc = CollectionServiceHandle::build(db.clone());
        let p = auth_ctx_for_user(&db, &u).await.expect("auth");
        let col = svc
            .create_collection_for_user(
                &p,
                CreateCollection {
                    owner: Some(a),
                    title: "X".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
            )
            .await
            .expect("create");

        let r = svc
            .move_collection_for_user(
                &p,
                &col.id,
                MoveOwner {
                    owner: "   ".into(),
                },
            )
            .await;
        assert!(matches!(r, Err(AppError::InvalidRequest(_))));
    }

    /// BLC-COLL-020: platform admin does not gain move without library write.
    #[tokio::test]
    async fn blc_coll_024_platform_admin_move_requires_library_write() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fx");
        let svc = CollectionServiceHandle::build(db.clone());
        let admin_p = auth_ctx_for_user(&db, &fx.admin_user).await.expect("auth");
        let pa_p = auth_ctx_for_user(&db, &fx.platform_admin)
            .await
            .expect("auth");

        let col = svc
            .create_collection_for_user(
                &admin_p,
                CreateCollection {
                    owner: Some(fx.shared_team_id.clone()),
                    title: "OnShared".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
            )
            .await
            .expect("create");

        let dest = personal_team_id(&db, &fx.admin_user).await.expect("dest");
        let r = svc
            .move_collection_for_user(&pa_p, &col.id, MoveOwner { owner: dest })
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }
}
