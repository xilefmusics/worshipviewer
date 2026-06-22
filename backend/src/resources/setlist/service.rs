use std::sync::Arc;

use shared::MoveOwner;
use shared::api::ListQuery;
use shared::player::Player;
use shared::setlist::{CreateSetlist, PatchSetlist, Setlist};
use shared::song::Song;
use tracing::instrument;

use crate::auth::AuthorizationContext;
use crate::error::AppError;
use crate::resources::common::{read_teams_for_query, resolve_owner_team, validate_song_links};
use crate::resources::song::LikedSongIds;
use crate::resources::team::{parse_owner_record_id, thing_record_key};

use super::repository::SetlistRepository;
use super::surreal_repo::SurrealSetlistRepo;
use crate::resources::common::player_from_song_links;

#[derive(Clone)]
pub struct SetlistService<R, L> {
    pub repo: R,
    pub likes: L,
}

impl<R, L> SetlistService<R, L> {
    pub fn new(repo: R, likes: L) -> Self {
        Self { repo, likes }
    }
}

impl<R: SetlistRepository, L: LikedSongIds> SetlistService<R, L> {
    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn list_setlists_for_user(
        &self,
        ctx: &AuthorizationContext,
        pagination: ListQuery,
    ) -> Result<Vec<Setlist>, AppError> {
        let read_teams = read_teams_for_query(&ctx.read_teams(), pagination.team.as_deref())?;
        self.repo.get_setlists(&read_teams, pagination).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn count_setlists_for_user(
        &self,
        ctx: &AuthorizationContext,
        query: &ListQuery,
    ) -> Result<u64, AppError> {
        let read_teams = read_teams_for_query(&ctx.read_teams(), query.team.as_deref())?;
        self.repo
            .count_setlists(&read_teams, query.q.as_deref())
            .await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn get_setlist_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Setlist, AppError> {
        let read_teams = ctx.read_teams();
        self.repo.get_setlist(&read_teams, id).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn setlist_player_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Player, AppError> {
        let user_id = ctx.user.id.clone();
        let liked_set = self.likes.liked_song_ids(&user_id).await?;
        let read_teams = ctx.read_teams();
        let links = self.repo.get_setlist_songs(&read_teams, id).await?;
        player_from_song_links(liked_set, links)
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn setlist_songs_for_user(
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
            .get_setlist_songs(&read_teams, id)
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

    #[instrument(level = "debug", err, skip(self, ctx, setlist))]
    pub async fn create_setlist_for_user(
        &self,
        ctx: &AuthorizationContext,
        mut setlist: CreateSetlist,
    ) -> Result<Setlist, AppError> {
        validate_song_links(&setlist.songs)?;
        let owner = match setlist.owner.take() {
            None => ctx.personal_team()?,
            Some(ref s) => {
                let rid = parse_owner_record_id(s)?;
                ctx.require_write_access_to_owner(&rid)?;
                rid
            }
        };
        self.repo.create_setlist(owner, setlist).await
    }

    #[instrument(level = "debug", err, skip(self, ctx, setlist))]
    pub async fn update_setlist_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        setlist: CreateSetlist,
        owner: Option<String>,
    ) -> Result<Setlist, AppError> {
        validate_song_links(&setlist.songs)?;
        let write_teams = ctx.write_teams();
        let owner = resolve_owner_team(&write_teams, owner)?;
        self.repo
            .update_setlist(&write_teams, id, setlist, owner)
            .await
    }

    #[instrument(level = "debug", err, skip(self, ctx, patch))]
    pub async fn patch_setlist_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        patch: PatchSetlist,
    ) -> Result<Setlist, AppError> {
        let owner = patch.owner.clone();
        let current = self.get_setlist_for_user(ctx, id).await?;
        let merged = CreateSetlist {
            owner: None,
            title: patch.title.unwrap_or(current.title),
            songs: patch.songs.unwrap_or(current.songs),
        };
        self.update_setlist_for_user(ctx, id, merged, owner).await
    }

    #[instrument(level = "debug", err, skip(self, ctx, payload))]
    pub async fn move_setlist_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        payload: MoveOwner,
    ) -> Result<Setlist, AppError> {
        let setlist = self.get_setlist_for_user(ctx, id).await?;
        let current = parse_owner_record_id(&setlist.owner)?;
        let dest = parse_owner_record_id(&payload.owner)?;
        if thing_record_key(&current) == thing_record_key(&dest) {
            return Ok(setlist);
        }
        ctx.require_write_access_to_owner(&current)?;
        ctx.require_write_access_to_owner(&dest)?;
        let write_teams = ctx.write_teams();
        self.repo.move_setlist_owner(&write_teams, id, dest).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn delete_setlist_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Setlist, AppError> {
        let write_teams = ctx.write_teams();
        self.repo.delete_setlist(&write_teams, id).await
    }
}

/// Type alias for the production HTTP stack.
pub type SetlistServiceHandle =
    SetlistService<super::surreal_repo::SurrealSetlistRepo, Arc<crate::database::Database>>;

impl SetlistServiceHandle {
    pub fn build(db: Arc<crate::database::Database>) -> Self {
        SetlistService::new(SurrealSetlistRepo::new(db.clone()), db.clone())
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::sync::Arc;

    use async_trait::async_trait;
    use surrealdb::types::RecordId;

    use shared::api::ListQuery;
    use shared::setlist::{CreateSetlist, Setlist};
    use shared::song::LinkOwned as SongLinkOwned;
    use shared::team::TeamRole;

    use crate::auth::context::{AuthorizationContext, AuthorizedTeam, AuthorizedTeamRole};
    use crate::database::Database;
    use crate::error::AppError;
    use crate::resources::User;
    use crate::resources::song::LikedSongIds;
    use crate::resources::team::thing_record_key;
    use crate::test_helpers::{
        TeamFixture, auth_ctx_for_user, auth_ctx_with_teams, configure_personal_team_members,
        create_song_with_title, create_user, personal_team_id, setlist_service, setlist_with_songs,
        test_db, two_shared_teams_for_user,
    };
    use shared::MoveOwner;

    use super::{SetlistRepository, SetlistService};

    fn mock_auth_ctx(user: &User, read: &[RecordId], write: &[RecordId]) -> AuthorizationContext {
        let mut teams: Vec<AuthorizedTeam> = Vec::new();

        for rid in read {
            let key = thing_record_key(rid);
            let role = if write.iter().any(|w| thing_record_key(w) == key) {
                AuthorizedTeamRole::Admin
            } else {
                AuthorizedTeamRole::Guest
            };
            teams.push(AuthorizedTeam {
                id: rid.clone(),
                owner_user_id: None,
                role,
            });
        }

        for w in write {
            if read
                .iter()
                .any(|r| thing_record_key(r) == thing_record_key(w))
            {
                continue;
            }
            teams.push(AuthorizedTeam {
                id: w.clone(),
                owner_user_id: None,
                role: AuthorizedTeamRole::Admin,
            });
        }

        auth_ctx_with_teams(user, teams)
    }

    struct MockRepo {
        setlists: Vec<Setlist>,
        get_returns: Option<Setlist>,
        update_ok: bool,
    }

    #[async_trait]
    impl SetlistRepository for MockRepo {
        async fn get_setlists(
            &self,
            _read_teams: &[RecordId],
            _pagination: ListQuery,
        ) -> Result<Vec<Setlist>, AppError> {
            Ok(self.setlists.clone())
        }

        async fn count_setlists(
            &self,
            _read_teams: &[RecordId],
            _q: Option<&str>,
        ) -> Result<u64, AppError> {
            Ok(self.setlists.len() as u64)
        }

        async fn get_setlist(
            &self,
            _read_teams: &[RecordId],
            _id: &str,
        ) -> Result<Setlist, AppError> {
            self.get_returns
                .clone()
                .ok_or_else(|| AppError::NotFound("setlist not found".into()))
        }

        async fn get_setlist_songs(
            &self,
            _read_teams: &[RecordId],
            _id: &str,
        ) -> Result<Vec<SongLinkOwned>, AppError> {
            Ok(vec![])
        }

        async fn create_setlist(
            &self,
            _owner: RecordId,
            _setlist: CreateSetlist,
        ) -> Result<Setlist, AppError> {
            unreachable!("not used in these tests")
        }

        async fn update_setlist(
            &self,
            _write_teams: &[RecordId],
            _id: &str,
            _setlist: CreateSetlist,
            _owner: Option<RecordId>,
        ) -> Result<Setlist, AppError> {
            if self.update_ok {
                Ok(Setlist {
                    id: "x".into(),
                    owner: "t".into(),
                    title: "ok".into(),
                    songs: vec![],
                })
            } else {
                Err(AppError::NotFound("setlist not found".into()))
            }
        }

        async fn delete_setlist(
            &self,
            _write_teams: &[RecordId],
            _id: &str,
        ) -> Result<Setlist, AppError> {
            Err(AppError::NotFound("setlist not found".into()))
        }

        async fn move_setlist_owner(
            &self,
            _write_teams: &[RecordId],
            _id: &str,
            _new_owner: RecordId,
        ) -> Result<Setlist, AppError> {
            unreachable!("not used in these tests")
        }
    }

    struct MockLikes {
        ids: HashSet<String>,
    }

    #[async_trait]
    impl LikedSongIds for MockLikes {
        async fn liked_song_ids(&self, _user_id: &str) -> Result<HashSet<String>, AppError> {
            Ok(self.ids.clone())
        }
    }

    fn team_a() -> RecordId {
        RecordId::new("team", "a")
    }

    fn team_b() -> RecordId {
        RecordId::new("team", "b")
    }

    fn test_user() -> User {
        User::new("u@test.local")
    }

    /// Shared integration fixture: owner, reader (Guest), writer (ContentMaintainer), and a
    /// noperm user, all on a fresh isolated in-memory DB. ACL is configured on the owner's
    /// personal team so that read_u can read and write_u can write owner's content.
    async fn four_user_setlist_fixture() -> (Arc<Database>, User, User, User, User, String) {
        let db = test_db().await.expect("db");
        let owner = create_user(&db, "setl-owner@test.local")
            .await
            .expect("owner");
        let read_u = create_user(&db, "setl-read@test.local")
            .await
            .expect("read");
        let write_u = create_user(&db, "setl-write@test.local")
            .await
            .expect("write");
        let noperm = create_user(&db, "setl-noperm@test.local")
            .await
            .expect("noperm");
        let team_id = personal_team_id(&db, &owner).await.expect("team id");
        configure_personal_team_members(
            &db,
            &owner,
            &team_id,
            vec![
                (read_u.id.clone(), TeamRole::Guest),
                (write_u.id.clone(), TeamRole::ContentMaintainer),
            ],
        )
        .await
        .expect("acl");
        (db, owner, read_u, write_u, noperm, team_id)
    }

    /// BLC-SETL-006: missing setlist → NotFound
    #[tokio::test]
    async fn get_returns_not_found_when_setlist_missing() {
        let user = test_user();
        let svc = SetlistService::new(
            MockRepo {
                setlists: vec![],
                get_returns: None,
                update_ok: false,
            },
            MockLikes {
                ids: HashSet::new(),
            },
        );
        let ctx = mock_auth_ctx(&user, &[team_a()], &[]);
        let r = svc.get_setlist_for_user(&ctx, "nope").await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-SETL-007: write teams exclude owner → update NotFound
    #[tokio::test]
    async fn update_rejects_when_user_not_in_write_teams() {
        let user = test_user();
        let svc = SetlistService::new(
            MockRepo {
                setlists: vec![],
                get_returns: None,
                update_ok: false,
            },
            MockLikes {
                ids: HashSet::new(),
            },
        );
        let ctx = mock_auth_ctx(&user, &[team_a()], &[team_b()]);
        let r = svc
            .update_setlist_for_user(
                &ctx,
                "id",
                CreateSetlist {
                    owner: None,
                    title: "t".into(),
                    songs: vec![],
                },
                None,
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-SETL-008: owner can update (repo succeeds)
    #[tokio::test]
    async fn update_succeeds_for_owner() {
        let user = test_user();
        let svc = SetlistService::new(
            MockRepo {
                setlists: vec![],
                get_returns: None,
                update_ok: true,
            },
            MockLikes {
                ids: HashSet::new(),
            },
        );
        let ctx = mock_auth_ctx(&user, &[team_a()], &[team_a()]);
        let r = svc
            .update_setlist_for_user(
                &ctx,
                "id",
                CreateSetlist {
                    owner: None,
                    title: "t".into(),
                    songs: vec![],
                },
                None,
            )
            .await;
        assert!(r.is_ok());
    }

    /// BLC-SETL-002: team ACL is correctly configured — owner, reader, writer, noperm users
    /// can be set up without error.
    #[tokio::test]
    async fn blc_setl_002_team_acl_configured() {
        let (_db, _owner, _read, _write, _noperm, _team) = four_user_setlist_fixture().await;
    }

    #[tokio::test]
    async fn blc_setl_put_moves_owner_when_target_writable() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &fx.admin_user, "S")
            .await
            .expect("s");
        let admin_p = auth_ctx_for_user(&db, &fx.admin_user).await.expect("auth");
        let created = sl
            .create_setlist_for_user(
                &admin_p,
                setlist_with_songs("MoveSet", &[(s1.id.as_str(), None)]),
            )
            .await
            .expect("create");
        let personal = personal_team_id(&db, &fx.admin_user).await.expect("pt");
        assert_eq!(created.owner, personal);
        let updated = sl
            .update_setlist_for_user(
                &admin_p,
                &created.id,
                setlist_with_songs("MoveSet", &[(s1.id.as_str(), None)]),
                Some(fx.shared_team_id.clone()),
            )
            .await
            .expect("move");
        assert_eq!(updated.owner, fx.shared_team_id);
    }

    /// BLC-SETL-009a: create sets owner to the owner's personal team and stores title/songs.
    #[tokio::test]
    async fn blc_setl_create_owner_and_title() {
        let (db, owner, _read_u, _write_u, _noperm, team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song One")
            .await
            .expect("s1");
        let s2 = create_song_with_title(&db, &owner, "Song Two")
            .await
            .expect("s2");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        let created = sl
            .create_setlist_for_user(
                &owner_p,
                setlist_with_songs(
                    "Sunday Morning Set",
                    &[(s1.id.as_str(), Some("1")), (s2.id.as_str(), Some("2"))],
                ),
            )
            .await
            .expect("create");

        assert_eq!(created.owner, team_id);
        assert_eq!(created.title, "Sunday Morning Set");
        assert_eq!(created.songs.len(), 2);
    }

    /// BLC-SETL-009b: list returns correct counts for owner, reader, and noperm user;
    /// pagination by page+page_size works correctly.
    #[tokio::test]
    async fn blc_setl_list_and_pagination() {
        let (db, owner, read_u, _write_u, noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song One")
            .await
            .expect("s1");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let read_p = auth_ctx_for_user(&db, &read_u).await.expect("auth");
        let noperm_p = auth_ctx_for_user(&db, &noperm).await.expect("auth");

        sl.create_setlist_for_user(
            &owner_p,
            setlist_with_songs("Set A", &[(s1.id.as_str(), Some("1"))]),
        )
        .await
        .expect("create A");
        sl.create_setlist_for_user(
            &owner_p,
            setlist_with_songs("Set B", &[(s1.id.as_str(), Some("2"))]),
        )
        .await
        .expect("create B");

        let all = sl
            .list_setlists_for_user(&owner_p, ListQuery::default())
            .await
            .expect("list all");
        assert_eq!(all.len(), 2);

        let page = sl
            .list_setlists_for_user(&owner_p, ListQuery::new().with_page(0).with_page_size(1))
            .await
            .expect("page 0 size 1");
        assert_eq!(page.len(), 1);

        let beyond = sl
            .list_setlists_for_user(&owner_p, ListQuery::new().with_page(10).with_page_size(10))
            .await
            .expect("beyond");
        assert_eq!(beyond.len(), 0);

        let read_list = sl
            .list_setlists_for_user(&read_p, ListQuery::default())
            .await
            .expect("reader list");
        assert_eq!(read_list.len(), 2);

        let noperm_list = sl
            .list_setlists_for_user(&noperm_p, ListQuery::default())
            .await
            .expect("noperm list");
        assert_eq!(noperm_list.len(), 0);
    }

    /// Partial pagination parameters use server defaults:
    /// - only `page` supplied → page_size defaults to 50
    /// - only `page_size` supplied → page defaults to 0
    #[tokio::test]
    async fn blc_setl_list_partial_pagination() {
        let (db, owner, _read_u, _write_u, _noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song")
            .await
            .expect("s");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        sl.create_setlist_for_user(&owner_p, setlist_with_songs("A", &[(s1.id.as_str(), None)]))
            .await
            .expect("A");
        sl.create_setlist_for_user(&owner_p, setlist_with_songs("B", &[(s1.id.as_str(), None)]))
            .await
            .expect("B");

        // page=1 with default page_size=50 → offset=50, but only 2 items exist → empty
        let page_only = sl
            .list_setlists_for_user(&owner_p, ListQuery::new().with_page(1))
            .await
            .expect("page only");
        assert_eq!(
            page_only.len(),
            0,
            "page=1 with default page_size beyond last page"
        );

        // page_size=1 with default page=0 → first item only
        let page_size_only = sl
            .list_setlists_for_user(&owner_p, ListQuery::new().with_page_size(1))
            .await
            .expect("page_size only");
        assert_eq!(
            page_size_only.len(),
            1,
            "page_size=1 with default page=0 returns 1 item"
        );
    }

    /// BLC-SETL-009d: full-text search with `q` narrows results; blank/whitespace-only q
    /// is treated as no filter; unmatched token returns empty list.
    #[tokio::test]
    async fn blc_setl_search() {
        let (db, owner, _read_u, _write_u, _noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song")
            .await
            .expect("s");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        let sunday = sl
            .create_setlist_for_user(
                &owner_p,
                setlist_with_songs("Sunday Morning Set", &[(s1.id.as_str(), None)]),
            )
            .await
            .expect("sunday");
        sl.create_setlist_for_user(
            &owner_p,
            setlist_with_songs("Wednesday Evening Set", &[(s1.id.as_str(), None)]),
        )
        .await
        .expect("wednesday");

        let q = sl
            .list_setlists_for_user(&owner_p, ListQuery::new().with_q("Sunday"))
            .await
            .expect("q Sunday");
        assert_eq!(q.len(), 1);
        assert_eq!(q[0].id, sunday.id);

        let q_page = sl
            .list_setlists_for_user(
                &owner_p,
                ListQuery::new()
                    .with_q("Sunday")
                    .with_page(0)
                    .with_page_size(1),
            )
            .await
            .expect("q+page");
        assert_eq!(q_page.len(), 1);

        let q_empty = sl
            .list_setlists_for_user(
                &owner_p,
                ListQuery::new().with_q("SetlistNoSuchTokenEver999zz"),
            )
            .await
            .expect("q no match");
        assert_eq!(q_empty.len(), 0);

        let q_blank = sl
            .list_setlists_for_user(&owner_p, ListQuery::new().with_q(" "))
            .await
            .expect("q blank");
        assert_eq!(q_blank.len(), 2);
    }

    /// BLC-SETL-009e: get returns the correct setlist for owner and reader; returns
    /// NotFound for noperm user, InvalidRequest for wrong-table id, NotFound for
    /// non-existent id.
    #[tokio::test]
    async fn blc_setl_get_acl() {
        let (db, owner, read_u, _write_u, noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song One")
            .await
            .expect("s1");
        let s2 = create_song_with_title(&db, &owner, "Song Two")
            .await
            .expect("s2");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let read_p = auth_ctx_for_user(&db, &read_u).await.expect("auth");
        let noperm_p = auth_ctx_for_user(&db, &noperm).await.expect("auth");

        let created = sl
            .create_setlist_for_user(
                &owner_p,
                setlist_with_songs(
                    "Sunday Set",
                    &[(s1.id.as_str(), Some("1")), (s2.id.as_str(), Some("2"))],
                ),
            )
            .await
            .expect("create");

        let g = sl
            .get_setlist_for_user(&owner_p, &created.id)
            .await
            .expect("get owner");
        assert_eq!(g.songs.len(), 2);

        sl.get_setlist_for_user(&read_p, &created.id)
            .await
            .expect("get reader");

        let miss = sl.get_setlist_for_user(&noperm_p, &created.id).await;
        assert!(matches!(miss, Err(AppError::NotFound(_))));

        let bad_id = sl.get_setlist_for_user(&owner_p, "song:invalid").await;
        assert!(matches!(bad_id, Err(AppError::InvalidRequest(_))));

        let notfound = sl
            .get_setlist_for_user(&owner_p, "never-created-setlist")
            .await;
        assert!(matches!(notfound, Err(AppError::NotFound(_))));
    }

    /// BLC-SETL-009f: setlist_songs returns songs for owner and reader; NotFound for
    /// noperm, InvalidRequest for wrong-table id, NotFound for non-existent id.
    #[tokio::test]
    async fn blc_setl_songs_acl() {
        let (db, owner, read_u, _write_u, noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song One")
            .await
            .expect("s1");
        let s2 = create_song_with_title(&db, &owner, "Song Two")
            .await
            .expect("s2");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let read_p = auth_ctx_for_user(&db, &read_u).await.expect("auth");
        let noperm_p = auth_ctx_for_user(&db, &noperm).await.expect("auth");

        let created = sl
            .create_setlist_for_user(
                &owner_p,
                setlist_with_songs(
                    "Sunday Set",
                    &[(s1.id.as_str(), Some("1")), (s2.id.as_str(), Some("2"))],
                ),
            )
            .await
            .expect("create");

        let (songs, _) = sl
            .setlist_songs_for_user(&owner_p, &created.id, ListQuery::default())
            .await
            .expect("songs owner");
        assert_eq!(songs.len(), 2);

        let (songs_read, _) = sl
            .setlist_songs_for_user(&read_p, &created.id, ListQuery::default())
            .await
            .expect("songs reader");
        assert_eq!(songs_read.len(), 2);

        let songs_noperm = sl
            .setlist_songs_for_user(&noperm_p, &created.id, ListQuery::default())
            .await;
        assert!(matches!(songs_noperm, Err(AppError::NotFound(_))));

        let songs_bad = sl
            .setlist_songs_for_user(&owner_p, "song:invalid", ListQuery::default())
            .await;
        assert!(matches!(songs_bad, Err(AppError::InvalidRequest(_))));

        let songs_nf = sl
            .setlist_songs_for_user(&owner_p, "never-created-setlist", ListQuery::default())
            .await;
        assert!(matches!(songs_nf, Err(AppError::NotFound(_))));
    }

    /// BLC-SETL-009g: player returns a toc for owner and reader; NotFound for noperm,
    /// InvalidRequest for wrong-table id, NotFound for non-existent id.
    #[tokio::test]
    async fn blc_setl_player_acl() {
        let (db, owner, read_u, _write_u, noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song One")
            .await
            .expect("s1");
        let s2 = create_song_with_title(&db, &owner, "Song Two")
            .await
            .expect("s2");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let read_p = auth_ctx_for_user(&db, &read_u).await.expect("auth");
        let noperm_p = auth_ctx_for_user(&db, &noperm).await.expect("auth");

        let created = sl
            .create_setlist_for_user(
                &owner_p,
                setlist_with_songs(
                    "Sunday Set",
                    &[(s1.id.as_str(), Some("1")), (s2.id.as_str(), Some("2"))],
                ),
            )
            .await
            .expect("create");

        let player = sl
            .setlist_player_for_user(&owner_p, &created.id)
            .await
            .expect("player owner");
        assert_eq!(player.toc().len(), 2);

        sl.setlist_player_for_user(&read_p, &created.id)
            .await
            .expect("player reader");

        let pl_noperm = sl.setlist_player_for_user(&noperm_p, &created.id).await;
        assert!(matches!(pl_noperm, Err(AppError::NotFound(_))));

        let pl_bad = sl.setlist_player_for_user(&owner_p, "song:invalid").await;
        assert!(matches!(pl_bad, Err(AppError::InvalidRequest(_))));

        let pl_nf = sl
            .setlist_player_for_user(&owner_p, "never-created-setlist")
            .await;
        assert!(matches!(pl_nf, Err(AppError::NotFound(_))));
    }

    #[tokio::test]
    async fn flow_round_trip_and_clear_on_setlist() {
        use shared::song::{FlowSlot, Link as SongLink};

        let (db, owner, _read_u, _write_u, _noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let song = create_song_with_title(&db, &owner, "Flow Song")
            .await
            .expect("song");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        let created = sl
            .create_setlist_for_user(
                &owner_p,
                CreateSetlist {
                    owner: None,
                    title: "Flow Set".into(),
                    songs: vec![SongLink {
                        id: song.id.clone(),
                        nr: Some("1".into()),
                        key: None,
                        tempo: None,
                        language: None,
                        flow: Some(vec![FlowSlot {
                            section_title: "Verse".into(),
                            occurrence_index: 0,
                            repeat_count: 2,
                        }]),
                    }],
                },
            )
            .await
            .expect("create");

        let fetched = sl
            .get_setlist_for_user(&owner_p, &created.id)
            .await
            .expect("fetch");
        assert_eq!(fetched.songs[0].flow.as_ref().map(|f| f.len()), Some(1));
        assert_eq!(
            fetched.songs[0]
                .flow
                .as_ref()
                .and_then(|f| f.first())
                .map(|slot| slot.repeat_count),
            Some(2)
        );

        let cleared = sl
            .patch_setlist_for_user(
                &owner_p,
                &created.id,
                shared::setlist::PatchSetlist {
                    title: None,
                    songs: Some(vec![SongLink {
                        id: song.id.clone(),
                        nr: Some("1".into()),
                        key: None,
                        tempo: None,
                        language: None,
                        flow: None,
                    }]),
                    owner: None,
                },
            )
            .await
            .expect("clear");

        assert!(cleared.songs[0].flow.is_none());
    }

    #[tokio::test]
    async fn duplicate_setlist_slots_keep_independent_flows_in_player() {
        use shared::song::{FlowSlot, Link as SongLink};

        let (db, owner, _read_u, _write_u, _noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let song = create_song_with_title(&db, &owner, "Flow Song")
            .await
            .expect("song");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        let created = sl
            .create_setlist_for_user(
                &owner_p,
                CreateSetlist {
                    owner: None,
                    title: "Dup Flow Set".into(),
                    songs: vec![
                        SongLink {
                            id: song.id.clone(),
                            nr: Some("1".into()),
                            key: None,
                            tempo: None,
                            language: None,
                            flow: Some(vec![FlowSlot {
                                section_title: "Verse".into(),
                                occurrence_index: 0,
                                repeat_count: 1,
                            }]),
                        },
                        SongLink {
                            id: song.id.clone(),
                            nr: Some("2".into()),
                            key: None,
                            tempo: None,
                            language: None,
                            flow: Some(vec![FlowSlot {
                                section_title: "Chorus".into(),
                                occurrence_index: 0,
                                repeat_count: 2,
                            }]),
                        },
                    ],
                },
            )
            .await
            .expect("create");

        let player = sl
            .setlist_player_for_user(&owner_p, &created.id)
            .await
            .expect("player");

        let (first_item, _) = player.item();
        let player_second = player.next();
        let (second_item, _) = player_second.item();
        let first = match first_item {
            shared::player::PlayerItem::Chords(item) => item,
            _ => panic!("expected chords player item"),
        };
        let second = match second_item {
            shared::player::PlayerItem::Chords(item) => item,
            _ => panic!("expected chords player item"),
        };
        assert_eq!(
            first
                .flow
                .as_ref()
                .and_then(|f| f.first())
                .map(|slot| slot.section_title.as_str()),
            Some("Verse")
        );
        assert_eq!(
            second
                .flow
                .as_ref()
                .and_then(|f| f.first())
                .map(|slot| slot.section_title.as_str()),
            Some("Chorus")
        );
    }

    #[tokio::test]
    async fn flow_validation_rejects_empty_arrays() {
        use shared::song::Link as SongLink;

        let (db, owner, _read_u, _write_u, _noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let song = create_song_with_title(&db, &owner, "Flow Song")
            .await
            .expect("song");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        let err = sl
            .create_setlist_for_user(
                &owner_p,
                CreateSetlist {
                    owner: None,
                    title: "Invalid Flow".into(),
                    songs: vec![SongLink {
                        id: song.id.clone(),
                        nr: None,
                        key: None,
                        tempo: None,
                        language: None,
                        flow: Some(vec![]),
                    }],
                },
            )
            .await
            .expect_err("empty flow must be rejected");

        assert!(matches!(err, AppError::InvalidRequest(_)));
    }

    /// BLC-SETL-009i: update succeeds for owner (title changes) and for write user;
    /// writer's change is visible to owner on subsequent get; read user and noperm user
    /// are rejected; wrong-table id returns InvalidRequest; non-existent id returns
    /// NotFound.
    #[tokio::test]
    async fn blc_setl_update_acl() {
        let (db, owner, read_u, write_u, noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song One")
            .await
            .expect("s1");
        let s2 = create_song_with_title(&db, &owner, "Song Two")
            .await
            .expect("s2");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let read_p = auth_ctx_for_user(&db, &read_u).await.expect("auth");
        let write_p = auth_ctx_for_user(&db, &write_u).await.expect("auth");
        let noperm_p = auth_ctx_for_user(&db, &noperm).await.expect("auth");

        let created = sl
            .create_setlist_for_user(
                &owner_p,
                setlist_with_songs(
                    "Original Title",
                    &[(s1.id.as_str(), Some("1")), (s2.id.as_str(), Some("2"))],
                ),
            )
            .await
            .expect("create");

        let updated = sl
            .update_setlist_for_user(
                &owner_p,
                &created.id,
                setlist_with_songs(
                    "Owner Updated Title",
                    &[(s1.id.as_str(), Some("1")), (s2.id.as_str(), Some("2"))],
                ),
                None,
            )
            .await
            .expect("update owner");
        assert_eq!(updated.title, "Owner Updated Title");

        let write_updated = sl
            .update_setlist_for_user(
                &write_p,
                &created.id,
                setlist_with_songs(
                    "Write User Updated Title",
                    &[(s1.id.as_str(), Some("10")), (s2.id.as_str(), Some("20"))],
                ),
                None,
            )
            .await
            .expect("update write user");
        assert_eq!(write_updated.title, "Write User Updated Title");

        let after_write = sl
            .get_setlist_for_user(&owner_p, &created.id)
            .await
            .expect("get after write");
        assert_eq!(after_write.title, "Write User Updated Title");

        let put_read = sl
            .update_setlist_for_user(
                &read_p,
                &created.id,
                setlist_with_songs("Read User Put", &[(s1.id.as_str(), None)]),
                None,
            )
            .await;
        assert!(matches!(put_read, Err(AppError::NotFound(_))));

        let put_noperm = sl
            .update_setlist_for_user(
                &noperm_p,
                &created.id,
                setlist_with_songs("Should Fail", &[(s1.id.as_str(), None)]),
                None,
            )
            .await;
        assert!(matches!(put_noperm, Err(AppError::NotFound(_))));

        let put_bad = sl
            .update_setlist_for_user(
                &owner_p,
                "song:invalid",
                setlist_with_songs("x", &[(s1.id.as_str(), None)]),
                None,
            )
            .await;
        assert!(matches!(put_bad, Err(AppError::InvalidRequest(_))));

        let put_nf = sl
            .update_setlist_for_user(
                &owner_p,
                "never-created-setlist",
                setlist_with_songs("Unknown", &[(s1.id.as_str(), None)]),
                None,
            )
            .await;
        assert!(matches!(put_nf, Err(AppError::NotFound(_))));
    }

    /// PATCH-SETL-001: patch with only title changes title, songs remain unchanged.
    #[tokio::test]
    async fn patch_setlist_title_only_leaves_songs_unchanged() {
        use shared::setlist::PatchSetlist;
        let (db, owner, _read_u, _write_u, _noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song One")
            .await
            .expect("s1");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        let created = sl
            .create_setlist_for_user(
                &owner_p,
                setlist_with_songs("Original Title", &[(s1.id.as_str(), Some("1"))]),
            )
            .await
            .expect("create");

        let patched = sl
            .patch_setlist_for_user(
                &owner_p,
                &created.id,
                PatchSetlist {
                    title: Some("New Title".into()),
                    songs: None,
                    owner: None,
                },
            )
            .await
            .expect("patch");

        assert_eq!(patched.title, "New Title");
        assert_eq!(
            patched.songs.len(),
            created.songs.len(),
            "songs must be unchanged"
        );
    }

    /// PATCH-SETL-002: PATCH on non-existent setlist returns NotFound.
    #[tokio::test]
    async fn patch_setlist_not_found() {
        use shared::setlist::PatchSetlist;
        let (db, owner, _read_u, _write_u, _noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let r = sl
            .patch_setlist_for_user(
                &owner_p,
                "never-existed-setlist",
                PatchSetlist {
                    title: Some("x".into()),
                    songs: None,
                    owner: None,
                },
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// PATCH-SETL-003: read-only guest cannot PATCH a setlist.
    #[tokio::test]
    async fn patch_setlist_guest_cannot_patch() {
        use shared::setlist::PatchSetlist;
        let (db, owner, read_u, _write_u, _noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song")
            .await
            .expect("s");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let read_p = auth_ctx_for_user(&db, &read_u).await.expect("auth");
        let created = sl
            .create_setlist_for_user(
                &owner_p,
                setlist_with_songs("Title", &[(s1.id.as_str(), None)]),
            )
            .await
            .expect("create");
        let r = sl
            .patch_setlist_for_user(
                &read_p,
                &created.id,
                PatchSetlist {
                    title: Some("Hacked".into()),
                    songs: None,
                    owner: None,
                },
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    #[tokio::test]
    async fn patch_setlist_all_field_combinations() {
        use shared::setlist::PatchSetlist;

        let (db, owner, _read_u, _write_u, _noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song One")
            .await
            .expect("s1");
        let s2 = create_song_with_title(&db, &owner, "Song Two")
            .await
            .expect("s2");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        for mask in 0u8..4 {
            let created = sl
                .create_setlist_for_user(
                    &owner_p,
                    setlist_with_songs("BaseTitle", &[(s1.id.as_str(), Some("1"))]),
                )
                .await
                .expect("create");

            let include_title = (mask & 0b01) != 0;
            let include_songs = (mask & 0b10) != 0;

            let patched = sl
                .patch_setlist_for_user(
                    &owner_p,
                    &created.id,
                    PatchSetlist {
                        title: include_title.then_some("PatchedTitle".into()),
                        songs: include_songs.then_some(vec![shared::song::Link {
                            id: s2.id.clone(),
                            nr: Some("9".into()),
                            key: None,
                            tempo: None,
                            language: None,
                            flow: None,
                        }]),
                        owner: None,
                    },
                )
                .await
                .expect("patch");

            let expected_title = if include_title {
                "PatchedTitle"
            } else {
                "BaseTitle"
            };
            assert_eq!(
                patched.title, expected_title,
                "mask={mask:02b}: title mismatch"
            );
            if include_songs {
                assert_eq!(patched.songs.len(), 1, "mask={mask:02b}: expected 1 song");
                assert_eq!(
                    patched.songs[0].id, s2.id,
                    "mask={mask:02b}: songs replacement mismatch"
                );
            } else {
                assert_eq!(
                    patched.songs[0].id, s1.id,
                    "mask={mask:02b}: songs should remain unchanged"
                );
            }
        }
    }

    /// BLC-SETL-009j: delete is rejected for noperm and wrong-table id; write user can
    /// delete; owner can delete; double-delete returns NotFound.
    #[tokio::test]
    async fn blc_setl_delete_acl() {
        let (db, owner, _read_u, write_u, noperm, _team_id) = four_user_setlist_fixture().await;
        let sl = setlist_service(&db);
        let s1 = create_song_with_title(&db, &owner, "Song")
            .await
            .expect("s");
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let write_p = auth_ctx_for_user(&db, &write_u).await.expect("auth");
        let noperm_p = auth_ctx_for_user(&db, &noperm).await.expect("auth");

        let owner_setlist = sl
            .create_setlist_for_user(
                &owner_p,
                setlist_with_songs("Owner's Setlist", &[(s1.id.as_str(), Some("1"))]),
            )
            .await
            .expect("create owner setlist");

        let write_setlist = sl
            .create_setlist_for_user(
                &owner_p,
                setlist_with_songs("Write Setlist", &[(s1.id.as_str(), Some("1"))]),
            )
            .await
            .expect("create write setlist");

        let del_noperm = sl
            .delete_setlist_for_user(&noperm_p, &owner_setlist.id)
            .await;
        assert!(matches!(del_noperm, Err(AppError::NotFound(_))));

        let del_bad = sl.delete_setlist_for_user(&owner_p, "song:invalid").await;
        assert!(matches!(del_bad, Err(AppError::InvalidRequest(_))));

        sl.delete_setlist_for_user(&write_p, &write_setlist.id)
            .await
            .expect("write user delete");

        sl.delete_setlist_for_user(&owner_p, &owner_setlist.id)
            .await
            .expect("owner delete");

        let again = sl
            .delete_setlist_for_user(&owner_p, &owner_setlist.id)
            .await;
        assert!(matches!(again, Err(AppError::NotFound(_))));
    }

    /// BLC-SETL-015–016: move between shared teams and idempotent same-owner.
    #[tokio::test]
    async fn blc_setl_015_move_between_teams_and_idempotent() {
        let db = test_db().await.expect("db");
        let mover = create_user(&db, "sl-move@test.local").await.expect("mover");
        let (team_a, team_b) = two_shared_teams_for_user(&db, &mover).await.expect("teams");

        let sl = setlist_service(&db);
        let p = auth_ctx_for_user(&db, &mover).await.expect("auth");

        let s = sl
            .create_setlist_for_user(
                &p,
                CreateSetlist {
                    owner: Some(team_a.clone()),
                    title: "OnA".into(),
                    songs: vec![],
                },
            )
            .await
            .expect("create");
        assert_eq!(s.owner, team_a);

        let on_b = sl
            .move_setlist_for_user(
                &p,
                &s.id,
                MoveOwner {
                    owner: team_b.clone(),
                },
            )
            .await
            .expect("to B");
        assert_eq!(on_b.owner, team_b);

        let idem = sl
            .move_setlist_for_user(
                &p,
                &s.id,
                MoveOwner {
                    owner: team_b.clone(),
                },
            )
            .await
            .expect("idem");
        assert_eq!(idem.owner, team_b);
    }
}
