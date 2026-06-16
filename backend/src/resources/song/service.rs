use std::sync::Arc;

use shared::MoveOwner;
use shared::api::SongListQuery;
use shared::like::LikeStatus;
use shared::patch::Patch;
use shared::player::Player;
use shared::song::{
    CreateSong, Link as SongLink, LinkOwned as SongLinkOwned, PatchSong, PatchSongData, Song,
};

use crate::auth::AuthorizationContext;
use crate::database::Database;
use crate::error::AppError;
use crate::resources::collection::CollectionRepository;
use crate::resources::common::{read_teams_for_query, resolve_owner_team};

use crate::resources::team::{parse_owner_record_id, thing_record_key};
use tracing::instrument;

use super::liked::LikedSongIds;
use super::repository::{SongRepository, SongUpsertOutcome};
use super::surreal_repo::SurrealSongRepo;

#[derive(Clone)]
pub struct SongService<R, L, C> {
    pub repo: R,
    pub likes: L,
    pub collections: C,
}

impl<R, L, C> SongService<R, L, C> {
    pub fn new(repo: R, likes: L, collections: C) -> Self {
        Self {
            repo,
            likes,
            collections,
        }
    }
}

impl<R: SongRepository, L: LikedSongIds, C: CollectionRepository> SongService<R, L, C> {
    fn merge_song_data(
        mut current: chordlib::types::Song,
        patch: PatchSongData,
    ) -> chordlib::types::Song {
        if let Some(v) = patch.titles {
            current.titles = v;
        }
        match patch.subtitle {
            Patch::Missing => {}
            Patch::Null => current.subtitle = None,
            Patch::Value(v) => current.subtitle = Some(v),
        }
        match patch.copyright {
            Patch::Missing => {}
            Patch::Null => current.copyright = None,
            Patch::Value(v) => current.copyright = Some(v),
        }
        match patch.key {
            Patch::Missing => {}
            Patch::Null => current.key = None,
            Patch::Value(v) => current.key = Some(v),
        }
        if let Some(v) = patch.artists {
            current.artists = v;
        }
        if let Some(v) = patch.languages {
            current.languages = v;
        }
        match patch.tempo {
            Patch::Missing => {}
            Patch::Null => current.tempo = None,
            Patch::Value(v) => current.tempo = Some(v),
        }
        match patch.time {
            Patch::Missing => {}
            Patch::Null => current.time = None,
            Patch::Value(v) => current.time = Some(v),
        }
        if let Some(v) = patch.tags {
            current.tags = v;
        }
        if let Some(v) = patch.sections {
            current.sections = v;
        }
        current
    }

    #[instrument(level = "debug", err, skip(self, ctx, query))]
    pub async fn list_songs_for_user(
        &self,
        ctx: &AuthorizationContext,
        query: SongListQuery,
    ) -> Result<Vec<Song>, AppError> {
        let user_id = ctx.user.id.clone();
        let liked_set = self.likes.liked_song_ids(&user_id).await?;
        let read_teams = read_teams_for_query(&ctx.read_teams(), query.team.as_deref())?;
        Ok(self
            .repo
            .get_songs(&read_teams, query)
            .await?
            .into_iter()
            .map(|mut song| {
                song.user_specific_addons.liked = liked_set.contains(&song.id);
                song
            })
            .collect())
    }

    #[instrument(level = "debug", err, skip(self, ctx, query))]
    pub async fn count_songs_for_user(
        &self,
        ctx: &AuthorizationContext,
        query: &SongListQuery,
    ) -> Result<u64, AppError> {
        let read_teams = read_teams_for_query(&ctx.read_teams(), query.team.as_deref())?;
        self.repo.count_songs(&read_teams, query).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn get_song_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Song, AppError> {
        let user_id = ctx.user.id.clone();
        let liked_set = self.likes.liked_song_ids(&user_id).await?;
        let read_teams = ctx.read_teams();
        let mut song = self.repo.get_song(&read_teams, id).await?;
        song.user_specific_addons.liked = liked_set.contains(&song.id);
        Ok(song)
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn song_player_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Player, AppError> {
        let read_teams = ctx.read_teams();
        Ok(Player::from(SongLinkOwned {
            song: self.repo.get_song(&read_teams, id).await?,
            nr: None,
            key: None,
            tempo: None,
            language: None,
            liked: self
                .repo
                .get_song_like(&read_teams, &ctx.user.id, id)
                .await?,
        }))
    }

    #[instrument(level = "debug", err, skip(self, ctx, song))]
    pub async fn create_song_for_user(
        &self,
        ctx: &AuthorizationContext,
        song: CreateSong,
    ) -> Result<Song, AppError> {
        let collection_id = song.collection.trim().to_owned();
        if collection_id.is_empty() {
            return Err(AppError::invalid_request("collection is required"));
        }

        let read_teams = ctx.read_teams();
        let write_teams = ctx.write_teams();
        let collection = self
            .collections
            .get_collection(&read_teams, &collection_id)
            .await?;
        let owner = parse_owner_record_id(&collection.owner)?;
        ctx.require_write_access_to_owner(&owner)?;

        let created = self.repo.create_song(owner, song).await?;

        match self
            .collections
            .add_song_to_collection(
                &write_teams,
                &collection_id,
                SongLink {
                    id: created.id.clone(),
                    nr: None,
                    key: None,
                    tempo: None,
                    language: None,
                },
            )
            .await
        {
            Ok(()) => Ok(created),
            Err(e) => {
                let _ = self.repo.delete_song(&write_teams, &created.id).await;
                Err(e)
            }
        }
    }

    #[instrument(level = "debug", err, skip(self, ctx, song))]
    pub async fn update_song_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        song: CreateSong,
        owner: Option<String>,
    ) -> Result<SongUpsertOutcome, AppError> {
        let write_teams = ctx.write_teams();
        let owner = resolve_owner_team(&write_teams, owner)?;
        self.repo
            .update_song(&write_teams, &ctx.user.id, id, song, owner)
            .await
    }

    #[instrument(level = "debug", err, skip(self, ctx, patch))]
    pub async fn patch_song_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        patch: PatchSong,
    ) -> Result<Song, AppError> {
        let owner = patch.owner.clone();
        let current = self.get_song_for_user(ctx, id).await?;
        let merged = CreateSong {
            collection: String::new(),
            not_a_song: patch.not_a_song.unwrap_or(current.not_a_song),
            blobs: patch.blobs.unwrap_or(current.blobs),
            data: patch
                .data
                .map(|song_data_patch| Self::merge_song_data(current.data.clone(), song_data_patch))
                .unwrap_or(current.data),
        };
        self.update_song_for_user(ctx, id, merged, owner)
            .await
            .map(SongUpsertOutcome::into_song)
    }

    #[instrument(level = "debug", err, skip(self, ctx, payload))]
    pub async fn move_song_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        payload: MoveOwner,
    ) -> Result<Song, AppError> {
        let song = self.get_song_for_user(ctx, id).await?;
        let current = parse_owner_record_id(&song.owner)?;
        let dest = parse_owner_record_id(&payload.owner)?;
        if thing_record_key(&current) == thing_record_key(&dest) {
            return Ok(song);
        }
        ctx.require_write_access_to_owner(&current)?;
        ctx.require_write_access_to_owner(&dest)?;
        let write_teams = ctx.write_teams();
        self.repo.move_song_owner(&write_teams, id, dest).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn delete_song_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Song, AppError> {
        let write_teams = ctx.write_teams();
        self.repo.delete_song(&write_teams, id).await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn song_like_status_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<LikeStatus, AppError> {
        let read_teams = ctx.read_teams();
        let liked = self
            .repo
            .get_song_like(&read_teams, &ctx.user.id, id)
            .await?;
        Ok(LikeStatus { liked })
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn set_song_like_status_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        liked: bool,
    ) -> Result<LikeStatus, AppError> {
        let read_teams = ctx.read_teams();
        let liked = self
            .repo
            .set_song_like(&read_teams, &ctx.user.id, id, liked)
            .await?;
        Ok(LikeStatus { liked })
    }
}

/// Production type alias used in HTTP wiring.
pub type SongServiceHandle = SongService<
    SurrealSongRepo,
    Arc<Database>,
    crate::resources::collection::SurrealCollectionRepo,
>;

impl SongServiceHandle {
    pub fn build(db: Arc<Database>) -> Self {
        SongService::new(
            SurrealSongRepo::new(db.clone()),
            db.clone(),
            crate::resources::collection::SurrealCollectionRepo::new(db.clone()),
        )
    }
}

#[cfg(test)]
mod tests {
    use shared::blob::BlobLink;

    use crate::test_helpers::{
        TeamFixture, auth_ctx_for_user, configure_personal_team_members, create_song_with_title,
        create_user, personal_team_id, setlist_service, setlist_with_songs, test_db,
        two_shared_teams_for_user,
    };
    use shared::MoveOwner;
    use shared::api::ListQuery;
    use shared::song::CreateSong;
    use shared::team::TeamRole;

    use super::SongServiceHandle;

    #[tokio::test]
    async fn blc_song_crud_search_likes() {
        let db = test_db().await.expect("db");
        let svc = SongServiceHandle::build(db.clone());

        let owner = create_user(&db, "song-owner@test.local").await.expect("o");
        let other = create_user(&db, "song-other@test.local").await.expect("x");
        let team_id = personal_team_id(&db, &owner).await.expect("team");
        configure_personal_team_members(
            &db,
            &owner,
            &team_id,
            vec![(other.id.clone(), TeamRole::Guest)],
        )
        .await
        .expect("acl");

        let s1 = create_song_with_title(&db, &owner, "Unique Song Alpha")
            .await
            .expect("s1");
        let _s2 = create_song_with_title(&db, &owner, "Other Beta")
            .await
            .expect("s2");

        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let other_p = auth_ctx_for_user(&db, &other).await.expect("auth");

        let list = svc
            .list_songs_for_user(&owner_p, ListQuery::default().into())
            .await
            .expect("list");
        assert!(list.len() >= 2);

        let q = svc
            .list_songs_for_user(&owner_p, ListQuery::new().with_q("Alpha").into())
            .await
            .expect("search");
        assert_eq!(q.len(), 1);
        assert_eq!(q[0].id, s1.id);

        svc.get_song_for_user(&owner_p, &s1.id).await.expect("get");
        svc.get_song_for_user(&other_p, &s1.id)
            .await
            .expect("guest read");

        let bad = svc.get_song_for_user(&owner_p, "setlist:not-a-song").await;
        assert!(bad.is_err(), "wrong table id should not resolve: {bad:?}");

        svc.set_song_like_status_for_user(&owner_p, &s1.id, true)
            .await
            .expect("like");
        let st = svc
            .song_like_status_for_user(&owner_p, &s1.id)
            .await
            .expect("like status");
        assert!(st.liked);

        svc.delete_song_for_user(&owner_p, &s1.id)
            .await
            .expect("del");
    }

    /// Build a four-user song fixture: owner, content_maintainer, guest, non_member.
    async fn four_user_song_fixture() -> (
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
        let owner = create_user(&db, "s3h-owner@test.local")
            .await
            .expect("owner");
        let cm = create_user(&db, "s3h-cm@test.local").await.expect("cm");
        let guest_u = create_user(&db, "s3h-guest@test.local")
            .await
            .expect("guest");
        let non_member = create_user(&db, "s3h-nm@test.local").await.expect("nm");
        let tid = personal_team_id(&db, &owner).await.expect("tid");
        configure_personal_team_members(
            &db,
            &owner,
            &tid,
            vec![
                (cm.id.clone(), TeamRole::ContentMaintainer),
                (guest_u.id.clone(), TeamRole::Guest),
            ],
        )
        .await
        .expect("acl");
        (db, owner, cm, guest_u, non_member, tid)
    }

    /// BLC-SONG-002, BLC-SONG-006: non-member reads song → NotFound (verify it is not 403).
    #[tokio::test]
    async fn blc_song_002_non_member_read_not_found() {
        let (db, owner, _cm, _guest, nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let nm_p = auth_ctx_for_user(&db, &nm).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "NMSong")
            .await
            .expect("song");
        let r = svc.get_song_for_user(&nm_p, &song.id).await;
        assert!(matches!(r, Err(crate::error::AppError::NotFound(_))));
        // Verify owner can still read it (sanity check that song exists).
        svc.get_song_for_user(&owner_p, &song.id)
            .await
            .expect("owner reads ok");
    }

    /// BLC-SONG-007: guest cannot PUT (update) a song.
    #[tokio::test]
    async fn blc_song_007_guest_cannot_put() {
        use shared::song::CreateSong;
        let (db, owner, _cm, guest_u, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let _owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let guest_p = auth_ctx_for_user(&db, &guest_u).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "GuestPUTSong")
            .await
            .expect("song");
        let create = CreateSong {
            collection: String::new(),
            not_a_song: false,
            blobs: vec![],
            data: crate::test_helpers::minimal_song_data(),
        };
        let r = svc
            .update_song_for_user(&guest_p, &song.id, create, None)
            .await;
        assert!(matches!(r, Err(crate::error::AppError::NotFound(_))));
    }

    /// BLC-SONG-007: guest cannot DELETE a song.
    #[tokio::test]
    async fn blc_song_007_guest_cannot_delete() {
        let (db, owner, _cm, guest_u, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let guest_p = auth_ctx_for_user(&db, &guest_u).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "GuestDELSong")
            .await
            .expect("song");
        let r = svc.delete_song_for_user(&guest_p, &song.id).await;
        assert!(matches!(r, Err(crate::error::AppError::NotFound(_))));
        // Song still exists.
        svc.get_song_for_user(&owner_p, &song.id)
            .await
            .expect("still exists");
    }

    /// BLC-SONG-008: content_maintainer can update a song.
    #[tokio::test]
    async fn blc_song_008_content_maintainer_can_update() {
        use shared::song::CreateSong;
        let (db, owner, cm, _guest, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let _owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let cm_p = auth_ctx_for_user(&db, &cm).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "CMUpdateSong")
            .await
            .expect("song");
        let mut data = crate::test_helpers::minimal_song_data();
        data.titles = vec!["UpdatedTitle".into()];
        let create = CreateSong {
            collection: String::new(),
            not_a_song: false,
            blobs: vec![],
            data,
        };
        svc.update_song_for_user(&cm_p, &song.id, create, None)
            .await
            .expect("cm update")
            .into_song();
    }

    /// BLC-SONG-003: PUT does not change the song's owner.
    #[tokio::test]
    async fn blc_song_003_put_does_not_change_owner() {
        use shared::song::CreateSong;
        let (db, owner, _cm, _guest, _nm, tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "OwnerSong")
            .await
            .expect("song");
        assert_eq!(song.owner, tid);
        let data = crate::test_helpers::minimal_song_data();
        let create = CreateSong {
            collection: String::new(),
            not_a_song: false,
            blobs: vec![],
            data,
        };
        let updated = svc
            .update_song_for_user(&owner_p, &song.id, create, None)
            .await
            .expect("update")
            .into_song();
        assert_eq!(
            updated.owner, tid,
            "owner must not change on PUT when omitted"
        );
    }

    /// PUT with `owner` moves the song when the actor can write both teams.
    #[tokio::test]
    async fn blc_song_put_moves_owner_when_target_writable() {
        use shared::song::CreateSong;
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = SongServiceHandle::build(db.clone());
        let admin_p = auth_ctx_for_user(&db, &fx.admin_user).await.expect("auth");
        let song = create_song_with_title(&db, &fx.admin_user, "MoveMeSong")
            .await
            .expect("song");
        let personal = personal_team_id(&db, &fx.admin_user)
            .await
            .expect("personal");
        assert_eq!(song.owner, personal);
        let data = crate::test_helpers::minimal_song_data();
        let create = CreateSong {
            collection: String::new(),
            not_a_song: false,
            blobs: vec![],
            data,
        };
        let updated = svc
            .update_song_for_user(&admin_p, &song.id, create, Some(fx.shared_team_id.clone()))
            .await
            .expect("move owner")
            .into_song();
        assert_eq!(updated.owner, fx.shared_team_id);
    }

    /// PUT with `owner` the actor cannot write returns NotFound.
    #[tokio::test]
    async fn blc_song_put_rejects_unwritable_target_owner() {
        use shared::song::CreateSong;
        let (db, owner, _cm, _guest, nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let nm_pt = personal_team_id(&db, &nm).await.expect("nm personal");
        let song = create_song_with_title(&db, &owner, "StayMine")
            .await
            .expect("song");
        let create = CreateSong {
            collection: String::new(),
            not_a_song: false,
            blobs: vec![],
            data: crate::test_helpers::minimal_song_data(),
        };
        let r = svc
            .update_song_for_user(&owner_p, &song.id, create, Some(nm_pt))
            .await;
        assert!(matches!(r, Err(crate::error::AppError::NotFound(_))));
    }

    /// BLC-SONG-011: list songs filtered by artist name matches.
    #[tokio::test]
    async fn blc_song_011_search_by_artist() {
        use shared::api::ListQuery;
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        let coll = crate::test_helpers::ensure_test_collection(&db, &owner)
            .await
            .expect("collection");
        let mut data_with_artist = crate::test_helpers::minimal_song_data();
        data_with_artist.titles = vec!["SongByArtist".into()];
        data_with_artist.artists = vec!["UniqueArtistZZZ".into()];
        let create = shared::song::CreateSong {
            collection: coll.clone(),
            not_a_song: false,
            blobs: vec![],
            data: data_with_artist,
        };
        svc.create_song_for_user(&owner_p, create)
            .await
            .expect("with artist");

        let mut data_no_artist = crate::test_helpers::minimal_song_data();
        data_no_artist.titles = vec!["SongWithoutArtist".into()];
        let create2 = shared::song::CreateSong {
            collection: coll,
            not_a_song: false,
            blobs: vec![],
            data: data_no_artist,
        };
        svc.create_song_for_user(&owner_p, create2)
            .await
            .expect("without artist");

        let results = svc
            .list_songs_for_user(&owner_p, ListQuery::new().with_q("UniqueArtistZZZ").into())
            .await
            .expect("search artist");
        assert_eq!(results.len(), 1, "only the song with the artist must match");
        assert_eq!(results[0].data.artists, vec!["UniqueArtistZZZ"]);
    }

    /// BLC-SONG-012: GET song includes `liked: true` when the caller has liked it.
    #[tokio::test]
    async fn blc_song_012_liked_true_when_liked() {
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "LikeSong")
            .await
            .expect("song");
        svc.set_song_like_status_for_user(&owner_p, &song.id, true)
            .await
            .expect("like");
        let fetched = svc
            .get_song_for_user(&owner_p, &song.id)
            .await
            .expect("get");
        assert!(fetched.user_specific_addons.liked);
    }

    /// BLC-SONG-012: GET song includes `liked: false` when not liked.
    #[tokio::test]
    async fn blc_song_012_liked_false_when_not_liked() {
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "UnlikedSong")
            .await
            .expect("song");
        let fetched = svc
            .get_song_for_user(&owner_p, &song.id)
            .await
            .expect("get");
        assert!(!fetched.user_specific_addons.liked);
    }

    /// BLC-SONG-004: user A likes song, user B (guest) does not; each sees independent state.
    #[tokio::test]
    async fn blc_song_004_like_state_independent_per_user() {
        let (db, owner, _cm, guest_u, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let guest_p = auth_ctx_for_user(&db, &guest_u).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "IndependentLike")
            .await
            .expect("song");
        svc.set_song_like_status_for_user(&owner_p, &song.id, true)
            .await
            .expect("owner likes");
        let owner_status = svc
            .song_like_status_for_user(&owner_p, &song.id)
            .await
            .expect("owner status");
        let guest_status = svc
            .song_like_status_for_user(&guest_p, &song.id)
            .await
            .expect("guest status");
        assert!(owner_status.liked, "owner must see liked=true");
        assert!(
            !guest_status.liked,
            "guest must see liked=false (they never liked)"
        );
    }

    /// BLC-SONG-004: like on a song the user cannot read returns NotFound.
    #[tokio::test]
    async fn blc_song_004_like_unreadable_song_not_found() {
        let (db, owner, _cm, _guest, nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let _owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let nm_p = auth_ctx_for_user(&db, &nm).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "SecretLikeSong")
            .await
            .expect("song");
        let r = svc
            .set_song_like_status_for_user(&nm_p, &song.id, true)
            .await;
        assert!(matches!(r, Err(crate::error::AppError::NotFound(_))));
    }

    /// BLC-SONG-018: PUT with a brand-new ID as owner creates the song (upsert).
    #[tokio::test]
    async fn blc_song_018_put_new_id_creates_song() {
        use shared::song::CreateSong;
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let data = crate::test_helpers::minimal_song_data();
        let create = CreateSong {
            collection: String::new(),
            not_a_song: false,
            blobs: vec![],
            data,
        };
        let result = svc
            .update_song_for_user(&owner_p, "brand-new-id", create, None)
            .await;
        assert!(
            result.is_ok(),
            "upsert with new id must succeed for owner: {result:?}"
        );
    }

    /// PATCH-SONG-001: partial update only changes supplied fields; omitted fields keep their values.
    #[tokio::test]
    async fn patch_song_partial_update_only_changes_supplied_fields() {
        use shared::song::PatchSong;
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        let song = create_song_with_title(&db, &owner, "OriginalTitle")
            .await
            .expect("song");
        assert!(!song.not_a_song);

        // Patch only not_a_song; title (data) must remain unchanged.
        let patched = svc
            .patch_song_for_user(
                &owner_p,
                &song.id,
                PatchSong {
                    not_a_song: Some(true),
                    blobs: None,
                    data: None,
                    owner: None,
                },
            )
            .await
            .expect("patch");

        assert!(patched.not_a_song, "not_a_song must be updated");
        assert_eq!(
            patched.data.title(),
            song.data.title(),
            "title must remain unchanged"
        );
        assert_eq!(patched.blobs, song.blobs, "blobs must remain unchanged");
    }

    /// PATCH-SONG-002: guest cannot PATCH a song (same ACL as PUT).
    #[tokio::test]
    async fn patch_song_guest_cannot_patch() {
        use shared::song::PatchSong;
        let (db, owner, _cm, guest_u, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let guest_p = auth_ctx_for_user(&db, &guest_u).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "GuestPatchSong")
            .await
            .expect("song");
        let r = svc
            .patch_song_for_user(
                &guest_p,
                &song.id,
                PatchSong {
                    not_a_song: Some(true),
                    blobs: None,
                    data: None,
                    owner: None,
                },
            )
            .await;
        assert!(matches!(r, Err(crate::error::AppError::NotFound(_))));
    }

    /// PATCH-SONG-003: PATCH on non-existent song returns NotFound.
    #[tokio::test]
    async fn patch_song_not_found() {
        use shared::song::PatchSong;
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let r = svc
            .patch_song_for_user(
                &owner_p,
                "never-existed-song",
                PatchSong {
                    not_a_song: Some(true),
                    blobs: None,
                    data: None,
                    owner: None,
                },
            )
            .await;
        assert!(matches!(r, Err(crate::error::AppError::NotFound(_))));
    }

    /// PATCH-SONG-004: empty PATCH body leaves all fields unchanged.
    #[tokio::test]
    async fn patch_song_empty_body_is_noop() {
        use shared::song::PatchSong;
        let (db, owner, _cm, _guest, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let song = create_song_with_title(&db, &owner, "NoopSong")
            .await
            .expect("song");
        let patched = svc
            .patch_song_for_user(
                &owner_p,
                &song.id,
                PatchSong {
                    not_a_song: None,
                    blobs: None,
                    data: None,
                    owner: None,
                },
            )
            .await
            .expect("noop patch");
        assert_eq!(patched.not_a_song, song.not_a_song);
        assert_eq!(patched.data.title(), song.data.title());
    }

    #[tokio::test]
    async fn patch_song_all_field_combinations() {
        use shared::song::{CreateSong, PatchSong, PatchSongData};

        let (db, owner, _cm, _guest, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");

        let mut base_data = crate::test_helpers::minimal_song_data();
        base_data.titles = vec!["BaseTitle".into()];
        let patch_data = PatchSongData {
            titles: Some(vec!["PatchedTitle".into()]),
            ..PatchSongData::default()
        };
        let coll = crate::test_helpers::ensure_test_collection(&db, &owner)
            .await
            .expect("collection");

        for mask in 0u8..8 {
            let created = svc
                .create_song_for_user(
                    &owner_p,
                    CreateSong {
                        collection: coll.clone(),
                        not_a_song: false,
                        blobs: vec![BlobLink {
                            id: "base_blob".into(),
                        }],
                        data: base_data.clone(),
                    },
                )
                .await
                .expect("create");

            let include_not_a_song = (mask & 0b001) != 0;
            let include_blobs = (mask & 0b010) != 0;
            let include_data = (mask & 0b100) != 0;
            let expected_not_a_song = include_not_a_song;
            let expected_blobs = if include_blobs {
                vec![BlobLink {
                    id: "patched_blob".into(),
                }]
            } else {
                vec![BlobLink {
                    id: "base_blob".into(),
                }]
            };
            let expected_title = if include_data {
                "PatchedTitle"
            } else {
                "BaseTitle"
            };

            let patched = svc
                .patch_song_for_user(
                    &owner_p,
                    &created.id,
                    PatchSong {
                        not_a_song: include_not_a_song.then_some(true),
                        blobs: include_blobs.then_some(vec![BlobLink {
                            id: "patched_blob".into(),
                        }]),
                        data: include_data.then_some(patch_data.clone()),
                        owner: None,
                    },
                )
                .await
                .expect("patch");

            assert_eq!(
                patched.not_a_song, expected_not_a_song,
                "mask={mask:03b}: not_a_song mismatch"
            );
            assert_eq!(
                patched.blobs, expected_blobs,
                "mask={mask:03b}: blobs mismatch"
            );
            assert_eq!(
                patched.data.title(),
                expected_title,
                "mask={mask:03b}: data.title mismatch"
            );
        }
    }

    #[test]
    fn patch_song_data_all_field_combinations() {
        use std::collections::BTreeMap;

        use chordlib::types::SimpleChord;
        use shared::patch::Patch;
        use shared::song::PatchSongData;

        let c: SimpleChord = SimpleChord::new(3);
        let d: SimpleChord = SimpleChord::new(5);

        let mut base_tags = BTreeMap::new();
        base_tags.insert("base".to_string(), "value".to_string());
        let mut patch_tags = BTreeMap::new();
        patch_tags.insert("patched".to_string(), "yes".to_string());

        let base = chordlib::types::Song {
            titles: vec!["base-title".into()],
            subtitle: Some("base-sub".into()),
            copyright: Some("base-copyright".into()),
            key: Some(c.clone()),
            artists: vec!["base-artist".into()],
            languages: vec!["en".into()],
            tempo: Some(100),
            time: Some((4, 4)),
            tags: base_tags.clone(),
            sections: vec![],
        };

        for mask in 0u16..1024 {
            let include_titles = (mask & (1 << 0)) != 0;
            let include_subtitle = (mask & (1 << 1)) != 0;
            let include_copyright = (mask & (1 << 2)) != 0;
            let include_key = (mask & (1 << 3)) != 0;
            let include_artists = (mask & (1 << 4)) != 0;
            let include_languages = (mask & (1 << 5)) != 0;
            let include_tempo = (mask & (1 << 6)) != 0;
            let include_time = (mask & (1 << 7)) != 0;
            let include_tags = (mask & (1 << 8)) != 0;
            let include_sections = (mask & (1 << 9)) != 0;

            let patch = PatchSongData {
                titles: include_titles.then_some(vec!["patched-title".into()]),
                subtitle: if include_subtitle {
                    Patch::Value("patched-sub".into())
                } else {
                    Patch::Missing
                },
                copyright: if include_copyright {
                    Patch::Value("patched-copyright".into())
                } else {
                    Patch::Missing
                },
                key: if include_key {
                    Patch::Value(d.clone())
                } else {
                    Patch::Missing
                },
                artists: include_artists.then_some(vec!["patched-artist".into()]),
                languages: include_languages.then_some(vec!["de".into()]),
                tempo: if include_tempo {
                    Patch::Value(128)
                } else {
                    Patch::Missing
                },
                time: if include_time {
                    Patch::Value((3, 4))
                } else {
                    Patch::Missing
                },
                tags: include_tags.then_some(patch_tags.clone()),
                sections: include_sections.then_some(vec![]),
            };

            let merged = SongServiceHandle::merge_song_data(base.clone(), patch);

            assert_eq!(
                merged.titles,
                if include_titles {
                    vec!["patched-title".to_string()]
                } else {
                    vec!["base-title".to_string()]
                },
                "mask={mask:010b}: titles mismatch"
            );
            assert_eq!(
                merged.subtitle.as_deref(),
                Some(if include_subtitle {
                    "patched-sub"
                } else {
                    "base-sub"
                }),
                "mask={mask:010b}: subtitle mismatch"
            );
            assert_eq!(
                merged.copyright.as_deref(),
                Some(if include_copyright {
                    "patched-copyright"
                } else {
                    "base-copyright"
                }),
                "mask={mask:010b}: copyright mismatch"
            );
            assert_eq!(
                merged.key,
                Some(if include_key { d.clone() } else { c.clone() }),
                "mask={mask:010b}: key mismatch"
            );
            assert_eq!(
                merged.artists,
                if include_artists {
                    vec!["patched-artist".to_string()]
                } else {
                    vec!["base-artist".to_string()]
                },
                "mask={mask:010b}: artists mismatch"
            );
            assert_eq!(
                merged.languages,
                if include_languages {
                    vec!["de".to_string()]
                } else {
                    vec!["en".to_string()]
                },
                "mask={mask:010b}: languages mismatch"
            );
            assert_eq!(
                merged.tempo,
                Some(if include_tempo { 128 } else { 100 }),
                "mask={mask:010b}: tempo mismatch"
            );
            assert_eq!(
                merged.time,
                Some(if include_time { (3, 4) } else { (4, 4) }),
                "mask={mask:010b}: time mismatch"
            );
            assert_eq!(
                merged.tags,
                if include_tags {
                    patch_tags.clone()
                } else {
                    base_tags.clone()
                },
                "mask={mask:010b}: tags mismatch"
            );
            assert_eq!(
                merged.sections,
                vec![],
                "mask={mask:010b}: sections mismatch"
            );
        }
    }

    #[test]
    fn patch_song_data_null_clears_nullable_fields() {
        use shared::patch::Patch;
        use shared::song::PatchSongData;

        let c: chordlib::types::SimpleChord = chordlib::types::SimpleChord::new(3);
        let base = chordlib::types::Song {
            titles: vec!["base-title".into()],
            subtitle: Some("base-sub".into()),
            copyright: Some("base-copyright".into()),
            key: Some(c),
            artists: vec!["base-artist".into()],
            languages: vec!["en".into()],
            tempo: Some(100),
            time: Some((4, 4)),
            tags: Default::default(),
            sections: vec![],
        };

        let merged = SongServiceHandle::merge_song_data(
            base,
            PatchSongData {
                subtitle: Patch::Null,
                copyright: Patch::Null,
                key: Patch::Null,
                tempo: Patch::Null,
                time: Patch::Null,
                ..PatchSongData::default()
            },
        );

        assert_eq!(merged.subtitle, None);
        assert_eq!(merged.copyright, None);
        assert_eq!(merged.key, None);
        assert_eq!(merged.tempo, None);
        assert_eq!(merged.time, None);
    }

    /// PATCH-SONG-018: PUT with a brand-new ID as guest on someone else's team creates the song on
    /// the caller's own personal team (upsert; owner determined by caller, not team membership).
    #[tokio::test]
    async fn blc_song_018_put_new_id_as_guest_creates_on_own_team() {
        use crate::test_helpers::personal_team_id;
        use shared::song::CreateSong;
        let (db, _owner, _cm, guest_u, _nm, _tid) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let guest_p = auth_ctx_for_user(&db, &guest_u).await.expect("auth");
        let data = crate::test_helpers::minimal_song_data();
        let create = CreateSong {
            collection: String::new(),
            not_a_song: false,
            blobs: vec![],
            data,
        };
        // Guest can create songs on their own personal team via upsert.
        let result = svc
            .update_song_for_user(&guest_p, "brand-new-guest-created-id", create, None)
            .await
            .expect("guest can upsert to own personal team")
            .into_song();
        let guest_pt = personal_team_id(&db, &guest_u).await.expect("guest pt");
        assert_eq!(
            result.owner, guest_pt,
            "upserted song must be owned by guest's personal team"
        );
    }

    /// BLC-SONG-009: POST requires `collection`; missing collection is rejected.
    #[tokio::test]
    async fn blc_song_post_requires_collection() {
        use shared::song::CreateSong;
        let db = test_db().await.expect("db");
        let u = create_user(&db, "s3i-req@test.local").await.expect("u");
        let svc = SongServiceHandle::build(db.clone());
        let perms = auth_ctx_for_user(&db, &u).await.expect("auth");
        let r = svc
            .create_song_for_user(
                &perms,
                CreateSong {
                    collection: "   ".into(),
                    not_a_song: false,
                    blobs: vec![],
                    data: crate::test_helpers::minimal_song_data(),
                },
            )
            .await;
        assert!(matches!(r, Err(crate::error::AppError::InvalidRequest(_))));
    }

    /// BLC-SONG-009: POST with unknown collection returns NotFound.
    #[tokio::test]
    async fn blc_song_post_unknown_collection_not_found() {
        use shared::song::CreateSong;
        let db = test_db().await.expect("db");
        let u = create_user(&db, "s3i-unk@test.local").await.expect("u");
        let svc = SongServiceHandle::build(db.clone());
        let perms = auth_ctx_for_user(&db, &u).await.expect("auth");
        let r = svc
            .create_song_for_user(
                &perms,
                CreateSong {
                    collection: "nonexistent-collection-id".into(),
                    not_a_song: false,
                    blobs: vec![],
                    data: crate::test_helpers::minimal_song_data(),
                },
            )
            .await;
        assert!(matches!(r, Err(crate::error::AppError::NotFound(_))));
    }

    /// BLC-SONG-009/010: POST appends the song to the target collection on another team.
    #[tokio::test]
    async fn blc_song_post_appends_to_target_collection() {
        use shared::api::ListQuery;
        use shared::collection::CreateCollection;
        use shared::song::CreateSong;
        let (db, owner, cm, _guest, _nm, team_id) = four_user_song_fixture().await;
        let svc = SongServiceHandle::build(db.clone());
        let coll_svc = crate::test_helpers::collection_service(&db);
        let cm_p = auth_ctx_for_user(&db, &cm).await.expect("auth");
        let target_coll = coll_svc
            .create_collection_for_user(
                &cm_p,
                CreateCollection {
                    owner: Some(team_id.clone()),
                    title: "Shared Team Songs".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
            )
            .await
            .expect("collection on shared team");

        let song = svc
            .create_song_for_user(
                &cm_p,
                CreateSong {
                    collection: target_coll.id.clone(),
                    not_a_song: false,
                    blobs: vec![],
                    data: crate::test_helpers::minimal_song_data(),
                },
            )
            .await
            .expect("create on shared team collection");

        assert_eq!(song.owner, team_id);
        let (songs, _) = coll_svc
            .collection_songs_for_user(&cm_p, &target_coll.id, ListQuery::default())
            .await
            .expect("collection songs");
        assert!(
            songs.iter().any(|s| s.id == song.id),
            "song must appear in target collection"
        );

        let owner_p = auth_ctx_for_user(&db, &owner).await.expect("auth");
        let owner_coll = crate::test_helpers::ensure_test_collection(&db, &owner)
            .await
            .expect("owner collection");
        let _ = svc
            .create_song_for_user(
                &owner_p,
                CreateSong {
                    collection: owner_coll,
                    not_a_song: false,
                    blobs: vec![],
                    data: crate::test_helpers::minimal_song_data(),
                },
            )
            .await
            .expect("owner personal song in collection");
    }

    /// BLC-SONG-010: two POSTs to the same collection keep both songs in that collection.
    #[tokio::test]
    async fn blc_song_post_appends_multiple_songs_to_same_collection() {
        use shared::api::ListQuery;
        let db = test_db().await.expect("db");
        let u = create_user(&db, "s3i-existing@test.local")
            .await
            .expect("u");
        let svc = SongServiceHandle::build(db.clone());
        let perms = auth_ctx_for_user(&db, &u).await.expect("auth");
        let coll_id = crate::test_helpers::ensure_test_collection(&db, &u)
            .await
            .expect("collection");
        let song1 = svc
            .create_song_for_user(
                &perms,
                shared::song::CreateSong {
                    collection: coll_id.clone(),
                    not_a_song: false,
                    blobs: vec![],
                    data: {
                        let mut d = crate::test_helpers::minimal_song_data();
                        d.titles = vec!["First".into()];
                        d
                    },
                },
            )
            .await
            .expect("song1");

        let perms2 = auth_ctx_for_user(&db, &u).await.expect("auth");
        let song2 = svc
            .create_song_for_user(
                &perms2,
                shared::song::CreateSong {
                    collection: coll_id.clone(),
                    not_a_song: false,
                    blobs: vec![],
                    data: {
                        let mut d = crate::test_helpers::minimal_song_data();
                        d.titles = vec!["Second".into()];
                        d
                    },
                },
            )
            .await
            .expect("song2");

        let coll_svc = crate::test_helpers::collection_service(&db);
        let (songs, _) = coll_svc
            .collection_songs_for_user(&perms2, &coll_id, ListQuery::default())
            .await
            .expect("songs");
        let song_ids: Vec<&str> = songs.iter().map(|s| s.id.as_str()).collect();
        assert!(song_ids.contains(&song1.id.as_str()));
        assert!(song_ids.contains(&song2.id.as_str()));
    }

    #[tokio::test]
    async fn blc_song_delete_after_setlist_link() {
        let db = test_db().await.expect("db");
        let svc = SongServiceHandle::build(db.clone());

        let u = create_user(&db, "song-del@test.local").await.expect("u");
        let song = create_song_with_title(&db, &u, "ToDelete")
            .await
            .expect("song");
        let sl_svc = setlist_service(&db);
        let u_p = auth_ctx_for_user(&db, &u).await.expect("auth");
        let sl = sl_svc
            .create_setlist_for_user(
                &u_p,
                setlist_with_songs("L", &[(song.id.as_str(), Some("1"))]),
            )
            .await
            .expect("setlist");
        let song_p = auth_ctx_for_user(&db, &u).await.expect("auth");
        svc.delete_song_for_user(&song_p, &song.id)
            .await
            .expect("del song");
        let sl_svc2 = setlist_service(&db);
        let u_p2 = auth_ctx_for_user(&db, &u).await.expect("auth");
        let g = sl_svc2
            .get_setlist_for_user(&u_p2, &sl.id)
            .await
            .expect("get setlist");
        assert!(g.songs.is_empty());
    }

    /// BLC-SONG-020–021: move between shared teams and idempotent same-owner.
    #[tokio::test]
    async fn blc_song_020_move_between_teams_and_idempotent() {
        let db = test_db().await.expect("db");
        let mover = create_user(&db, "song-move@test.local")
            .await
            .expect("mover");
        let (team_a, team_b) = two_shared_teams_for_user(&db, &mover).await.expect("teams");

        let svc = SongServiceHandle::build(db.clone());
        let p = auth_ctx_for_user(&db, &mover).await.expect("auth");
        let coll_svc = crate::test_helpers::collection_service(&db);
        use shared::collection::CreateCollection;
        let coll = coll_svc
            .create_collection_for_user(
                &p,
                CreateCollection {
                    owner: Some(team_a.clone()),
                    title: "Team A Songs".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
            )
            .await
            .expect("collection");

        let song = svc
            .create_song_for_user(
                &p,
                CreateSong {
                    collection: coll.id,
                    not_a_song: false,
                    blobs: vec![],
                    data: crate::test_helpers::minimal_song_data(),
                },
            )
            .await
            .expect("create");
        assert_eq!(song.owner, team_a);

        let on_b = svc
            .move_song_for_user(
                &p,
                &song.id,
                MoveOwner {
                    owner: team_b.clone(),
                },
            )
            .await
            .expect("to B");
        assert_eq!(on_b.owner, team_b);

        let idem = svc
            .move_song_for_user(
                &p,
                &song.id,
                MoveOwner {
                    owner: team_b.clone(),
                },
            )
            .await
            .expect("idem");
        assert_eq!(idem.owner, team_b);
    }
}
