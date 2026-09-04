use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use anyhow::{Context, Result as AnyResult, anyhow};
use ring::digest::{SHA256, digest};
use serde::Deserialize;
use surrealdb::Surreal;
use surrealdb::engine::any::Any;
use surrealdb::types::SurrealValue;
use tracing::info;

/// How long another instance may hold the migration runner lock before it is treated as stale.
const MIGRATION_LOCK_STALE_SECS: u64 = 600;
/// Maximum time to wait for another instance to finish migrations before failing startup.
const MIGRATION_LOCK_WAIT_SECS: u64 = 120;

#[derive(Debug, Deserialize, SurrealValue)]
struct AppliedMigration {
    script_name: String,
    checksum: String,
}

pub async fn run(db: &Surreal<Any>, migration_root: &str) -> AnyResult<()> {
    let lock_holder = acquire_migration_lock(db).await?;
    let run_result = run_inner(db, migration_root).await;
    release_migration_lock(db, &lock_holder).await;
    run_result
}

async fn run_inner(db: &Surreal<Any>, migration_root: &str) -> AnyResult<()> {
    ensure_migration_table(db).await?;

    let migration_dir = resolve_migration_dir(migration_root)?;
    let files = list_migration_files(&migration_dir)?;
    let applied = load_applied_migrations(db).await?;

    for path in files {
        let script_name = file_name(&path)?;
        let script = fs::read_to_string(&path)
            .with_context(|| format!("failed to read migration script '{}'", path.display()))?;
        let checksum = script_checksum(&script);

        if let Some(existing_checksum) = applied.get(&script_name) {
            if existing_checksum != &checksum {
                return Err(anyhow!(
                    "migration '{}' checksum mismatch: expected {}, got {}",
                    script_name,
                    existing_checksum,
                    checksum
                ));
            }
            info!(
                migration = %script_name,
                status = "already_applied",
                "database migration already applied, skipping"
            );
            continue;
        }

        let started = Instant::now();
        info!(migration = %script_name, "applying database migration");
        apply_migration(db, &script_name, &checksum, &script).await?;
        let elapsed = started.elapsed();
        info!(
            migration = %script_name,
            duration_ms = elapsed.as_millis() as u64,
            status = "applied",
            "database migration finished successfully"
        );
    }

    Ok(())
}

async fn ensure_migration_table(db: &Surreal<Any>) -> AnyResult<()> {
    db.query(
        "DEFINE TABLE OVERWRITE migration_script TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE checksum ON migration_script TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE executed_at ON migration_script TYPE datetime READONLY VALUE time::now() PERMISSIONS FULL;
DEFINE FIELD OVERWRITE script_name ON migration_script TYPE string PERMISSIONS FULL;
DEFINE INDEX OVERWRITE migration_script_script_name_unique ON migration_script FIELDS script_name UNIQUE CONCURRENTLY;",
    )
    .await
    .map_err(|err| anyhow!(err))
    .context("failed to define migration_script table")
    .map(|_| ())
}

async fn load_applied_migrations(db: &Surreal<Any>) -> AnyResult<HashMap<String, String>> {
    let mut response = db
        .query("SELECT script_name, checksum FROM migration_script;")
        .await
        .map_err(|err| anyhow!(err))
        .context("failed to read applied migration records")?;

    let rows: Vec<AppliedMigration> = response
        .take(0)
        .map_err(|err| anyhow!(err))
        .context("failed to decode applied migration records")?;

    let mut out = HashMap::with_capacity(rows.len());
    for row in rows {
        out.insert(row.script_name, row.checksum);
    }
    Ok(out)
}

fn ensure_no_statement_errors(
    migration: &str,
    context: &str,
    response: &mut surrealdb::IndexedResults,
) -> AnyResult<()> {
    let errors = response.take_errors();
    if errors.is_empty() {
        return Ok(());
    }

    let mut pairs: Vec<(usize, surrealdb::Error)> = errors.into_iter().collect();
    pairs.sort_by_key(|(idx, _)| *idx);

    let mut summary = Vec::with_capacity(pairs.len());
    for (idx, err) in &pairs {
        crate::observability::log_surreal_statement_error_migration(migration, *idx, err);
        summary.push(format!("[statement {idx}] {err}"));
    }

    Err(anyhow!("{}", summary.join("; "))).context(format!("{context} '{}'", migration))
}

async fn apply_migration(
    db: &Surreal<Any>,
    script_name: &str,
    checksum: &str,
    script: &str,
) -> AnyResult<()> {
    let tx = format!(
        "BEGIN TRANSACTION;
{};
COMMIT TRANSACTION;",
        script
    );

    let mut body_response = db
        .query(tx)
        .await
        .map_err(|err| anyhow!(err))
        .with_context(|| format!("failed to apply migration body '{}'", script_name))?;
    ensure_no_statement_errors(
        script_name,
        "migration body returned errors",
        &mut body_response,
    )?;
    body_response
        .check()
        .map_err(|err| anyhow!(err))
        .with_context(|| format!("migration body returned errors '{}'", script_name))?;

    let mut record_response = db
        .query("CREATE migration_script SET script_name = $script_name, checksum = $checksum;")
        .bind(("script_name", script_name.to_owned()))
        .bind(("checksum", checksum.to_owned()))
        .await
        .map_err(|err| anyhow!(err))
        .with_context(|| format!("failed to record migration '{}'", script_name))?;
    ensure_no_statement_errors(
        script_name,
        "record migration returned errors",
        &mut record_response,
    )?;
    record_response
        .check()
        .map_err(|err| anyhow!(err))
        .with_context(|| format!("record migration returned errors '{}'", script_name))?;

    Ok(())
}

fn resolve_migration_dir(migration_root: &str) -> AnyResult<PathBuf> {
    let root = resolve_absolute_path(migration_root)?;
    if !root.exists() {
        return Err(anyhow!(
            "migration directory '{}' does not exist",
            root.display()
        ));
    }
    if !root.is_dir() {
        return Err(anyhow!(
            "migration path '{}' is not a directory",
            root.display()
        ));
    }
    Ok(root)
}

fn resolve_absolute_path(path: &str) -> AnyResult<PathBuf> {
    let candidate = Path::new(path);
    if candidate.is_absolute() {
        return Ok(candidate.to_path_buf());
    }

    let current_dir = env::current_dir().context("failed to resolve current working directory")?;
    Ok(current_dir.join(candidate))
}

fn list_migration_files(up_dir: &Path) -> AnyResult<Vec<PathBuf>> {
    let mut files = Vec::new();
    for entry in fs::read_dir(up_dir)
        .with_context(|| format!("failed to read migration directory '{}'", up_dir.display()))?
    {
        let entry = entry.map_err(|err| anyhow!(err)).with_context(|| {
            format!(
                "failed to read entry in migration directory '{}'",
                up_dir.display()
            )
        })?;
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("surql") {
            files.push(path);
        }
    }

    files.sort_by_key(|path| path.file_name().map(|name| name.to_os_string()));
    Ok(files)
}

fn file_name(path: &Path) -> AnyResult<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow!("invalid migration script file name: '{}'", path.display()))
}

fn script_checksum(script: &str) -> String {
    let digest = digest(&SHA256, script.as_bytes());
    hex::encode(digest.as_ref())
}

#[derive(Debug, Deserialize, SurrealValue)]
struct MigrationRunnerLockRow {
    holder: String,
    acquired_at: Option<surrealdb::types::Datetime>,
}

async fn ensure_migration_runner_lock_table(db: &Surreal<Any>) -> AnyResult<()> {
    db.query(
        "DEFINE TABLE OVERWRITE migration_runner_lock TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE holder ON migration_runner_lock TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE acquired_at ON migration_runner_lock TYPE datetime PERMISSIONS FULL;",
    )
    .await
    .map_err(|err| anyhow!(err))
    .context("failed to define migration_runner_lock table")
    .map(|_| ())
}

async fn read_migration_lock(db: &Surreal<Any>) -> AnyResult<Option<MigrationRunnerLockRow>> {
    let mut response = db
        .query("SELECT holder, acquired_at FROM migration_runner_lock:global;")
        .await
        .map_err(|err| anyhow!(err))
        .context("failed to read migration runner lock")?;

    let rows: Vec<MigrationRunnerLockRow> = response
        .take(0)
        .map_err(|err| anyhow!(err))
        .context("failed to decode migration runner lock")?;

    Ok(rows.into_iter().next())
}

async fn try_claim_migration_lock(db: &Surreal<Any>, holder: &str) -> AnyResult<bool> {
    let stale_reap = format!(
        "DELETE migration_runner_lock:global WHERE acquired_at < (time::now() - type::duration('{}s'));",
        MIGRATION_LOCK_STALE_SECS
    );
    db.query(stale_reap)
        .await
        .map_err(|err| anyhow!(err))
        .context("failed to reap stale migration runner lock")?;

    if let Some(existing) = read_migration_lock(db).await? {
        if existing.holder == holder {
            db.query("UPDATE migration_runner_lock:global SET acquired_at = time::now();")
                .await
                .map_err(|err| anyhow!(err))
                .context("failed to renew migration runner lock")?;
            return Ok(true);
        }
        return Ok(false);
    }

    db.query(
        "CREATE migration_runner_lock:global SET holder = $holder, acquired_at = time::now();",
    )
    .bind(("holder", holder.to_owned()))
    .await
    .map_err(|err| anyhow!(err))
    .context("failed to create migration runner lock")?;

    Ok(true)
}

async fn acquire_migration_lock(db: &Surreal<Any>) -> AnyResult<String> {
    ensure_migration_runner_lock_table(db).await?;
    let holder = uuid::Uuid::new_v4().to_string();
    let deadline = Instant::now() + Duration::from_secs(MIGRATION_LOCK_WAIT_SECS);

    loop {
        if try_claim_migration_lock(db, &holder).await? {
            let current = read_migration_lock(db).await?;
            if current.as_ref().is_some_and(|row| row.holder == holder) {
                info!(migration_lock_holder = %holder, "acquired migration runner lock");
                return Ok(holder);
            }
        }

        if Instant::now() >= deadline {
            return Err(anyhow!(
                "timed out after {}s waiting for migration runner lock",
                MIGRATION_LOCK_WAIT_SECS
            ));
        }

        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

async fn release_migration_lock(db: &Surreal<Any>, holder: &str) {
    if let Err(err) = db
        .query("DELETE migration_runner_lock:global WHERE holder = $holder;")
        .bind(("holder", holder.to_owned()))
        .await
    {
        tracing::warn!(
            migration_lock_holder = %holder,
            error = %err,
            "failed to release migration runner lock"
        );
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::database::Database;

    #[tokio::test]
    async fn migrations_apply_on_fresh_database() {
        let address = format!("mem://{}", uuid::Uuid::new_v4());
        let db = Database::connect(&address, "test", "test", None, None)
            .await
            .expect("connect");
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/db-migrations");
        db.migrate(path).await.expect("first migrate");

        let mut response = db
            .db
            .query("SELECT count() AS count FROM migration_script GROUP ALL;")
            .await
            .expect("count query");
        #[derive(Debug, Deserialize, SurrealValue)]
        struct CountRow {
            count: u64,
        }
        let rows: Vec<CountRow> = response.take(0).expect("take");
        assert!(
            rows.first().map(|r| r.count).unwrap_or(0) > 0,
            "expected at least one applied migration"
        );

        db.db
            .query("INFO FOR TABLE media;")
            .await
            .expect("media table info query")
            .check()
            .expect("media table must exist after fresh migration");

        db.migrate(path).await.expect("idempotent second migrate");
    }

    #[tokio::test]
    async fn checksum_mismatch_aborts_migration() {
        let address = format!("mem://{}", uuid::Uuid::new_v4());
        let db = Database::connect(&address, "test", "test", None, None)
            .await
            .expect("connect");
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/db-migrations");
        db.migrate(path).await.expect("initial migrate");

        db.db
            .query(
                "UPDATE migration_script SET checksum = 'deadbeef' \
                 WHERE script_name = '20260420000000_define_analyzer.surql';",
            )
            .await
            .expect("corrupt checksum");

        let err = run(&db.db, path).await.expect_err("checksum mismatch");
        let msg = err.to_string();
        assert!(msg.contains("checksum mismatch"), "unexpected error: {msg}");
    }

    #[tokio::test]
    async fn room_song_pool_migration_preserves_room_state_and_queue() {
        let address = format!("mem://{}", uuid::Uuid::new_v4());
        let db = Database::connect(&address, "test", "test", None, None)
            .await
            .expect("connect");
        let migration_path =
            std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/db-migrations"));
        let legacy_dir = tempfile::tempdir().expect("legacy migration directory");
        for entry in fs::read_dir(migration_path).expect("read migrations") {
            let entry = entry.expect("migration entry");
            if !entry.path().is_file() {
                continue;
            }
            if entry.file_name() == "20260904120000_remove_player_room_song_pool.surql" {
                continue;
            }
            fs::copy(entry.path(), legacy_dir.path().join(entry.file_name()))
                .expect("copy legacy migration");
        }
        db.migrate(legacy_dir.path().to_str().expect("legacy path"))
            .await
            .expect("legacy migrations");
        db.db
            .query(
                "CREATE type::record('player_room', 'legacy-room') CONTENT {
                    owner: type::record('team', 'team-1'), name: 'Legacy',
                    snapshot_json: '{}', state_json: NONE, musical_state_json: '{}',
                    projection_json: NONE, revision: 7, invite_hash: 'invite',
                    host_participant_id: 'participant', av_participant_id: NONE,
                    media_ids: ['blob-1'], queue_json: '[{\"id\":\"q1\"}]',
                    queue_votes_json: '{\"q1\":[\"user-1\"]}', open: false,
                    song_pool_json: '{\"type\":\"collection\",\"id\":\"old\"}',
                    host_email: 'host@example.com', host_lease_expires_at: time::now(),
                    closed_at: NONE, guests_allowed: true
                };",
            )
            .await
            .expect("create legacy room")
            .check()
            .expect("legacy room state");

        let current_path = migration_path.to_str().expect("current path");
        db.migrate(current_path).await.expect("current migrations");
        let mut response = db
            .db
            .query("SELECT * FROM type::record('player_room', 'legacy-room')")
            .await
            .expect("read migrated room");
        let rows: Vec<serde_json::Value> = response.take(0).expect("decode migrated room");
        let room = rows.first().expect("migrated room row");
        assert_eq!(room["open"], false);
        assert_eq!(room["queue_json"], "[{\"id\":\"q1\"}]");
        assert_eq!(room["queue_votes_json"], "{\"q1\":[\"user-1\"]}");
        assert_eq!(room["media_ids"], serde_json::json!(["blob-1"]));
        assert!(room.get("song_pool_json").is_none());
    }

    #[tokio::test]
    async fn setlist_items_migration_converts_legacy_songs_and_is_idempotent() {
        use crate::resources::setlist::SetlistServiceHandle;
        use crate::test_helpers::{
            auth_ctx_for_user, create_song_with_title, create_user, personal_team_id, test_db,
        };
        use shared::api::ListQuery;

        let db = test_db().await.expect("db");
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/db-migrations");
        let user = create_user(&db, "setlist-migrate@test.local")
            .await
            .expect("user");
        let song = create_song_with_title(&db, &user, "Migrated")
            .await
            .expect("song");
        let team_id = personal_team_id(&db, &user).await.expect("team");

        db.db
            .query(
                "REMOVE FIELD items ON setlist;
                 DEFINE FIELD OVERWRITE songs ON setlist TYPE array<object> VALUE $value ?? $before ?? [] PERMISSIONS FULL;
                 DEFINE FIELD OVERWRITE songs.*.id ON setlist TYPE record<song> ASSERT $value != NONE PERMISSIONS FULL;
                 DEFINE FIELD OVERWRITE songs.*.nr ON setlist TYPE none | string PERMISSIONS FULL;
                 DEFINE FIELD OVERWRITE songs.*.key ON setlist TYPE none | object PERMISSIONS FULL;
                 DEFINE FIELD OVERWRITE songs.*.key.level ON setlist TYPE none | int ASSERT $value = NONE OR ($value >= 0 AND $value < 12) PERMISSIONS FULL;
                 DEFINE FIELD OVERWRITE songs.*.tempo ON setlist TYPE none | int ASSERT $value = NONE OR $value >= 0 PERMISSIONS FULL;
                 DEFINE FIELD OVERWRITE songs.*.language ON setlist TYPE none | string PERMISSIONS FULL;
                 DEFINE FIELD OVERWRITE songs.*.flow ON setlist TYPE none | array<object> PERMISSIONS FULL;
                 DELETE migration_script WHERE script_name = '20260826120000_epic_e5_media_and_setlist_items.surql';",
            )
            .await
            .expect("restore legacy songs schema")
            .check()
            .expect("legacy songs schema");

        db.db
            .query(
                "CREATE setlist CONTENT {
                    owner: type::record('team', $team),
                    title: 'Empty legacy',
                    songs: []
                };
                CREATE setlist CONTENT {
                    owner: type::record('team', $team),
                    title: 'One song',
                    songs: [{ id: type::record('song', $song), nr: '1', key: NONE, tempo: NONE, language: NONE, flow: NONE }]
                };
                CREATE setlist CONTENT {
                    owner: type::record('team', $team),
                    title: 'Repeated and overrides',
                    songs: [
                        {
                            id: type::record('song', $song),
                            nr: '1a',
                            key: { level: 3 },
                            tempo: 88,
                            language: 'de',
                            flow: [{ title: 'Verse', occurrence_index: 0, repeats: 2 }]
                        },
                        {
                            id: type::record('song', $song),
                            nr: NONE,
                            key: NONE,
                            tempo: NONE,
                            language: NONE,
                            flow: NONE
                        }
                    ]
                };",
            )
            .bind(("team", team_id.clone()))
            .bind(("song", song.id.clone()))
            .await
            .expect("insert legacy setlists")
            .check()
            .expect("legacy setlists inserted");

        db.migrate(path)
            .await
            .expect("forward setlist items migration");

        let ctx = auth_ctx_for_user(&db, &user).await.expect("auth");
        let svc = SetlistServiceHandle::build(db.clone());
        let mut setlists = svc
            .list_setlists_for_user(&ctx, ListQuery::default())
            .await
            .expect("list");
        setlists.sort_by(|a, b| a.title.cmp(&b.title));
        assert_eq!(setlists.len(), 3);

        let empty = setlists.iter().find(|s| s.title == "Empty legacy").unwrap();
        assert!(empty.items.is_empty());

        let one = setlists.iter().find(|s| s.title == "One song").unwrap();
        assert_eq!(one.items.len(), 1);
        assert_eq!(one.items[0].as_song().unwrap().id, song.id);
        assert_eq!(one.items[0].as_song().unwrap().nr.as_deref(), Some("1"));

        let mixed = setlists
            .iter()
            .find(|s| s.title == "Repeated and overrides")
            .unwrap();
        assert_eq!(mixed.items.len(), 2);
        let first = mixed.items[0].as_song().unwrap();
        assert_eq!(first.id, song.id);
        assert_eq!(first.nr.as_deref(), Some("1a"));
        assert_eq!(first.tempo, Some(88));
        assert_eq!(first.language.as_deref(), Some("de"));
        assert_eq!(first.key, Some(chordlib::types::SimpleChord::new(3)));
        assert_eq!(first.flow.as_ref().unwrap()[0].title, "Verse");
        assert_eq!(first.flow.as_ref().unwrap()[0].repeats, 2);
        assert_eq!(mixed.items[1].as_song().unwrap().id, song.id);
        assert!(mixed.items[1].as_song().unwrap().flow.is_none());

        db.migrate(path)
            .await
            .expect("idempotent second items migrate");
    }
}
