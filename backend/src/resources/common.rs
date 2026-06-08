use std::collections::{HashMap, HashSet};

use chordlib::types::SimpleChord;
use serde::{Deserialize, Serialize};
use surrealdb::Surreal;
use surrealdb::engine::any::Any;
use surrealdb::types::{Kind, RecordId, SurrealValue, Value, kind};

use shared::player::Player;
use shared::song::{Link as SongLink, LinkOwned as SongLinkOwned};

use crate::database::record_id_string;
use crate::error::AppError;
use crate::resources::song::SongRecord;

/// Newtype for chordlib [`SimpleChord`] in SurrealDB `SurrealValue` contexts.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(transparent)]
pub struct SimpleChordField(pub SimpleChord);

impl SurrealValue for SimpleChordField {
    fn kind_of() -> Kind {
        kind!(any)
    }

    fn is_value(_value: &Value) -> bool {
        true
    }

    fn into_value(self) -> Value {
        let j = serde_json::to_value(self.0).unwrap_or(serde_json::Value::Null);
        j.into_value()
    }

    fn from_value(value: Value) -> surrealdb::Result<Self> {
        let j = serde_json::Value::from_value(value)?;
        serde_json::from_value(j)
            .map(SimpleChordField)
            .map_err(|e| surrealdb::Error::internal(e.to_string()))
    }
}

/// Parse and validate a resource ID for the given table.
///
/// Accepts only plain IDs (`"abc"`). The `table:id` form is rejected with a `400` error
/// to prevent two distinct URLs from mapping to the same resource.
pub fn resource_id(table: &str, id: &str) -> Result<(String, String), AppError> {
    if id.contains(':') {
        return Err(AppError::invalid_request(format!("invalid {table} id")));
    }
    Ok((table.to_owned(), id.to_owned()))
}

/// Return `true` when `owner` is present and contained in `teams`.
pub fn belongs_to(owner: &Option<RecordId>, teams: &[RecordId]) -> bool {
    owner.as_ref().map(|t| teams.contains(t)).unwrap_or(false)
}

/// Coerce a string to a `song:…` [`RecordId`], validating the table prefix when present.
pub fn song_thing(id: &str) -> RecordId {
    match RecordId::parse_simple(id) {
        Ok(rid) if rid.table.as_str() == "song" => rid,
        _ => RecordId::new("song", id.to_owned()),
    }
}

/// Coerce a string to a `blob:…` [`RecordId`], validating the table prefix when present.
pub fn blob_thing(id: &str) -> RecordId {
    match RecordId::parse_simple(id) {
        Ok(rid) if rid.table.as_str() == "blob" => rid,
        _ => RecordId::new("blob", id.to_owned()),
    }
}

/// Parse a plain team id (API `owner` string) into a `team:…` [`RecordId`].
pub fn team_thing(id: &str) -> Result<RecordId, AppError> {
    let (tb, sid) = resource_id("team", id)?;
    Ok(RecordId::new(tb, sid))
}

/// Resolve optional `owner` from PUT/PATCH bodies: must be a team the caller may write.
pub fn resolve_owner_team(
    write_teams: &[RecordId],
    owner: Option<String>,
) -> Result<Option<RecordId>, AppError> {
    let Some(s) = owner else {
        return Ok(None);
    };
    if s.is_empty() {
        return Err(AppError::invalid_request("owner must not be empty"));
    }
    let tid = team_thing(&s)?;
    if write_teams.contains(&tid) {
        Ok(Some(tid))
    } else {
        Err(AppError::NotFound("resource not found".into()))
    }
}

/// Build a [`Player`] from fetched song links, populating liked flags and
/// filling in default track numbers where absent.
pub fn player_from_song_links(
    liked_set: HashSet<String>,
    links: Vec<SongLinkOwned>,
) -> Result<Player, AppError> {
    links
        .into_iter()
        .enumerate()
        .map(|(idx, link)| {
            Player::from(SongLinkOwned {
                liked: liked_set.contains(&link.song.id),
                song: link.song,
                nr: Some(link.nr.unwrap_or_else(|| (idx + 1).to_string())),
                key: link.key,
                tempo: link.tempo,
            })
        })
        .try_fold(Player::default(), |acc, player| {
            Ok::<Player, AppError>(acc + player)
        })
}

/// Owner + embedded song link rows (collection / setlist `songs` field).
#[derive(Deserialize, SurrealValue)]
pub struct SongLinkListRow {
    #[serde(default)]
    pub owner: Option<RecordId>,
    #[serde(default)]
    pub songs: Vec<SongLinkRecord>,
}

/// Load full [`Song`] values for setlist/collection link rows (`array<object>` with `id: record<song>`).
///
/// SurrealDB 3.0.x does not apply multi-part `FETCH` paths per array element the way 2.x did, so we batch-load `song` rows by record-id array (`SELECT * FROM $ids`).
pub async fn song_links_to_owned(
    db: &Surreal<Any>,
    links: Vec<SongLinkRecord>,
) -> Result<Vec<SongLinkOwned>, AppError> {
    if links.is_empty() {
        return Ok(vec![]);
    }
    let ids: Vec<RecordId> = links.iter().map(|l| l.id.clone()).collect();
    let mut response = db
        .query("SELECT * FROM $ids")
        .bind(("ids", ids))
        .await
        .map_err(|e| crate::log_and_convert!(AppError::database, "song.batch_by_id", e))?;
    let records: Vec<SongRecord> = response
        .take(0)
        .map_err(|e| crate::log_and_convert!(AppError::database, "song.batch_by_id.take", e))?;
    let mut by_id: HashMap<String, SongRecord> = HashMap::with_capacity(records.len());
    for r in records {
        let Some(ref rid) = r.id else {
            continue;
        };
        by_id.insert(record_id_string(rid), r);
    }
    map_song_link_records(links, &by_id)
}

fn map_song_link_records(
    links: Vec<SongLinkRecord>,
    by_id: &HashMap<String, SongRecord>,
) -> Result<Vec<SongLinkOwned>, AppError> {
    let mut out = Vec::with_capacity(links.len());
    for link in links {
        let sid = record_id_string(&link.id);
        let rec = by_id.get(&sid).cloned().ok_or_else(|| {
            AppError::database(
                "referenced song not found (collection or setlist data may be inconsistent)",
            )
        })?;
        out.push(SongLinkOwned {
            song: rec.into_song(),
            nr: link.nr,
            key: link.key.map(|k| k.0),
            tempo: link.tempo,
            liked: false,
        });
    }
    Ok(out)
}

/// DB record for a song reference stored on a setlist or collection.
#[derive(Clone, Debug, Serialize, Deserialize, SurrealValue)]
pub struct SongLinkRecord {
    id: RecordId,
    #[serde(default)]
    nr: Option<String>,
    #[serde(default)]
    key: Option<SimpleChordField>,
    #[serde(default)]
    tempo: Option<u32>,
}

impl From<SongLinkRecord> for SongLink {
    fn from(record: SongLinkRecord) -> Self {
        Self {
            id: record_id_string(&record.id),
            nr: record.nr,
            key: record.key.map(|k| k.0),
            tempo: record.tempo,
        }
    }
}

impl From<SongLink> for SongLinkRecord {
    fn from(link: SongLink) -> Self {
        Self {
            id: song_thing(&link.id),
            nr: link.nr,
            key: link.key.map(SimpleChordField),
            tempo: link.tempo,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use shared::song::Song;
    use surrealdb::types::RecordId;

    use super::*;
    use crate::error::AppError;

    #[test]
    fn resource_id_plain_id() {
        assert_eq!(
            resource_id("setlist", "abc").unwrap(),
            ("setlist".to_owned(), "abc".to_owned())
        );
    }

    #[test]
    fn resource_id_rejects_table_colon_id() {
        let err = resource_id("setlist", "setlist:myid").unwrap_err();
        assert!(matches!(err, AppError::InvalidRequest(_)));
    }

    #[test]
    fn resource_id_rejects_any_colon_form() {
        let err = resource_id("setlist", "song:foo").unwrap_err();
        assert!(matches!(err, AppError::InvalidRequest(_)));
    }

    #[test]
    fn resource_id_works_for_different_tables() {
        assert_eq!(
            resource_id("song", "s1").unwrap(),
            ("song".to_owned(), "s1".to_owned())
        );
        assert_eq!(
            resource_id("blob", "b1").unwrap(),
            ("blob".to_owned(), "b1".to_owned())
        );
    }

    #[test]
    fn belongs_to_returns_true_when_owner_in_teams() {
        let owner = RecordId::new("team", "t1");
        assert!(belongs_to(
            &Some(owner.clone()),
            &[owner, RecordId::new("team", "t2")]
        ));
    }

    #[test]
    fn belongs_to_returns_false_when_owner_missing() {
        assert!(!belongs_to(&None, &[RecordId::new("team", "t1")]));
    }

    #[test]
    fn belongs_to_returns_false_when_owner_not_in_teams() {
        let owner = RecordId::new("team", "mine");
        assert!(!belongs_to(&Some(owner), &[RecordId::new("team", "other")]));
    }

    #[test]
    fn player_from_song_links_sets_liked_flag_and_default_nr() {
        use shared::song::LinkOwned as SongLinkOwned;

        let mut liked = HashSet::new();
        liked.insert("a".into());
        let s1 = Song {
            id: "a".into(),
            ..Default::default()
        };
        let s2 = Song {
            id: "b".into(),
            ..Default::default()
        };
        let links = vec![
            SongLinkOwned {
                song: s1,
                nr: None,
                key: None,
                tempo: None,
                liked: false,
            },
            SongLinkOwned {
                song: s2,
                nr: Some("x".into()),
                key: None,
                tempo: None,
                liked: false,
            },
        ];
        let player = player_from_song_links(liked, links).unwrap();
        assert!(player.is_liked("a"));
        assert!(!player.is_liked("b"));
        let toc = player.toc();
        assert_eq!(toc.len(), 2);
        assert_eq!(toc[0].nr, "1");
        assert_eq!(toc[1].nr, "x");
    }

    #[test]
    fn map_song_link_records_reuses_song_for_duplicate_slots() {
        let song_id = RecordId::new("song", "anchor");
        let by_id = HashMap::from([(
            record_id_string(&song_id),
            SongRecord {
                id: Some(song_id.clone()),
                ..Default::default()
            },
        )]);
        let links = vec![
            SongLinkRecord::from(SongLink {
                id: record_id_string(&song_id),
                nr: Some("1".into()),
                key: None,
                tempo: None,
            }),
            SongLinkRecord::from(SongLink {
                id: record_id_string(&song_id),
                nr: Some("2".into()),
                key: None,
                tempo: None,
            }),
        ];

        let owned = map_song_link_records(links, &by_id).unwrap();
        assert_eq!(owned.len(), 2);
        assert_eq!(owned[0].song.id, record_id_string(&song_id));
        assert_eq!(owned[1].song.id, record_id_string(&song_id));
        assert_eq!(owned[0].nr.as_deref(), Some("1"));
        assert_eq!(owned[1].nr.as_deref(), Some("2"));

        let player = player_from_song_links(HashSet::new(), owned).unwrap();
        assert_eq!(player.toc().len(), 2);
        assert_eq!(player.max_index(), 1);
    }
}
