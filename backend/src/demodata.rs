use std::collections::BTreeMap;

use anyhow::{Context, Result as AnyResult, anyhow};
use chordlib::types::{Chord, Line, Part, Section, SimpleChord, Song as SongData, SongFlowItem};
use serde::{Deserialize, Serialize};
use surrealdb::types::{RecordId, SurrealValue};
use tracing::info;

use crate::database::Database;
use crate::resources::collection::CollectionRecord;
use crate::resources::media::{MediaRecord, MediaWrite};
use crate::resources::setlist::SetlistRecord;
use crate::resources::song::{
    LikeRecord, SongDataField, SongRecord, search_content_from_song_data,
};
use crate::resources::team::{DbTeamMember, TeamCreatePayload};
use shared::media::{LivestreamType, MediaContent, SpotifyResourceType};
use shared::setlist::{CreateSetlist, SetlistItem, SongLink as SetlistSongLink};
use shared::song::Link as CollectionSongLink;

const GENERIC_VERSION: i64 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scenario {
    Generic,
}

impl Scenario {
    pub fn parse(value: Option<&str>) -> AnyResult<Option<Self>> {
        let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
            return Ok(None);
        };

        match value.to_ascii_lowercase().as_str() {
            "generic" => Ok(Some(Self::Generic)),
            other => Err(anyhow!(
                "unknown DEMODATA scenario '{other}'; supported scenarios: generic"
            )),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Generic => "generic",
        }
    }
}

pub fn validate_environment(production: bool, scenario: Option<Scenario>) -> AnyResult<()> {
    if production && scenario.is_some() {
        return Err(anyhow!(
            "refusing to start: demodata is enabled under WORSHIP_PRODUCTION or RUST_ENV=production"
        ));
    }
    Ok(())
}

#[derive(Debug, Deserialize, SurrealValue)]
struct SeedMarker {
    version: i64,
}

#[derive(Debug, Serialize, SurrealValue)]
struct SeedMarkerRecord {
    scenario: String,
    version: i64,
}

#[derive(Debug, Serialize, SurrealValue)]
struct UserSeedRecord {
    email: String,
    role: String,
}

#[derive(Debug, Default)]
struct SeedSummary {
    users: usize,
    teams: usize,
    songs: usize,
    collections: usize,
    setlists: usize,
    media: usize,
    likes: usize,
}

impl SeedSummary {
    fn log(&self) {
        info!(
            users = self.users,
            teams = self.teams,
            songs = self.songs,
            collections = self.collections,
            setlists = self.setlists,
            media = self.media,
            likes = self.likes,
            "demodata seeded"
        );
    }
}

pub async fn seed(db: &Database, scenario: Scenario) -> AnyResult<()> {
    let marker_id = RecordId::new("demodata_seed", scenario.name());
    let marker: Option<SeedMarker> = db
        .db
        .select(marker_id.clone())
        .await
        .context("failed to inspect demodata marker")?;
    if marker
        .as_ref()
        .is_some_and(|marker| marker.version >= GENERIC_VERSION)
    {
        info!(scenario = scenario.name(), "demodata already seeded");
        return Ok(());
    }

    let summary = match scenario {
        Scenario::Generic => seed_generic(db).await?,
    };

    let _: Option<SeedMarker> = db
        .db
        .upsert(marker_id)
        .content(SeedMarkerRecord {
            scenario: scenario.name().to_owned(),
            version: GENERIC_VERSION,
        })
        .await
        .context("failed to write demodata marker")?;
    summary.log();
    Ok(())
}

async fn seed_generic(db: &Database) -> AnyResult<SeedSummary> {
    let mut summary = SeedSummary::default();

    let users = [
        (
            "demodata-platform-admin",
            "platform-admin@worshipviewer.test",
            "admin",
        ),
        (
            "demodata-team-admin",
            "team-admin@worshipviewer.test",
            "default",
        ),
        (
            "demodata-maintainer",
            "maintainer@worshipviewer.test",
            "default",
        ),
        ("demodata-guest", "guest@worshipviewer.test", "default"),
        (
            "demodata-outsider",
            "outsider@worshipviewer.test",
            "default",
        ),
    ];
    for (id, email, role) in users {
        upsert(
            db,
            RecordId::new("user", id),
            UserSeedRecord {
                email: email.to_owned(),
                role: role.to_owned(),
            },
        )
        .await?;
        summary.users += 1;
    }

    let team_admin = user_thing("demodata-team-admin");
    let maintainer = user_thing("demodata-maintainer");
    let guest = user_thing("demodata-guest");
    let teams = [
        (
            "demodata-team-admin-personal",
            "Team admin personal",
            Some(team_admin.clone()),
            vec![],
        ),
        (
            "demodata-maintainer-personal",
            "Maintainer personal",
            Some(maintainer.clone()),
            vec![],
        ),
        (
            "demodata-guest-personal",
            "Guest personal",
            Some(guest.clone()),
            vec![],
        ),
        (
            "demodata-main-team",
            "Demo Worship Team",
            None,
            vec![
                member("demodata-team-admin", "admin"),
                member("demodata-maintainer", "content_maintainer"),
                member("demodata-guest", "guest"),
            ],
        ),
        (
            "demodata-archive-team",
            "Demo Archive Team",
            None,
            vec![
                member("demodata-team-admin", "admin"),
                member("demodata-maintainer", "content_maintainer"),
            ],
        ),
        (
            "demodata-platform-admin-personal",
            "Platform admin personal",
            Some(user_thing("demodata-platform-admin")),
            vec![],
        ),
        (
            "demodata-outsider-personal",
            "Outsider personal",
            Some(user_thing("demodata-outsider")),
            vec![],
        ),
    ];
    for (id, name, owner, members) in teams {
        upsert(
            db,
            RecordId::new("team", id),
            TeamCreatePayload {
                name: name.to_owned(),
                owner,
                members,
            },
        )
        .await?;
        summary.teams += 1;
    }

    let owners = [
        "demodata-main-team",
        "demodata-main-team",
        "demodata-main-team",
        "demodata-main-team",
        "demodata-main-team",
        "demodata-archive-team",
        "demodata-archive-team",
        "demodata-team-admin-personal",
        "demodata-maintainer-personal",
        "demodata-guest-personal",
    ];
    for index in 0..100 {
        let data = song_data(index);
        let owner = owners[index / 10];
        let song = SongRecord {
            id: None,
            owner: Some(RecordId::new("team", owner)),
            not_a_song: index >= 94,
            blobs: vec![],
            search_content: search_content_from_song_data(&data),
            data: SongDataField(data),
        };
        upsert(db, RecordId::new("song", song_id(index)), song).await?;
        summary.songs += 1;
    }

    let collection_specs = [
        (
            "main-repertoire",
            "Main Repertoire",
            "demodata-main-team",
            0,
            40,
        ),
        ("youth-night", "Youth Night", "demodata-main-team", 20, 40),
        (
            "bilingual-service",
            "Bilingual Service",
            "demodata-main-team",
            5,
            25,
        ),
        (
            "empty-collection",
            "Empty Collection",
            "demodata-main-team",
            0,
            0,
        ),
        (
            "archive-favorites",
            "Archive Favorites",
            "demodata-archive-team",
            60,
            20,
        ),
        (
            "admin-private",
            "Admin Private",
            "demodata-team-admin-personal",
            80,
            10,
        ),
        (
            "maintainer-private",
            "Maintainer Private",
            "demodata-maintainer-personal",
            90,
            5,
        ),
        (
            "guest-private",
            "Guest Private",
            "demodata-guest-personal",
            95,
            5,
        ),
    ];
    for (id, title, owner, start, count) in collection_specs {
        let songs: Vec<CollectionSongLink> = (start..start + count)
            .map(|index| CollectionSongLink {
                id: song_id(index),
                nr: Some((index - start + 1).to_string()),
                key: (index % 4 == 0).then(|| SimpleChord::new((index % 12) as u8)),
                tempo: None,
                language: None,
            })
            .collect();
        let collection = CollectionRecord {
            id: None,
            owner: Some(RecordId::new("team", owner)),
            title: title.to_owned(),
            cover: None,
            songs: songs.into_iter().map(Into::into).collect(),
        };
        upsert(
            db,
            RecordId::new("collection", format!("demodata-{id}")),
            collection,
        )
        .await?;
        summary.collections += 1;
    }

    let media_specs = [
        (
            "youtube",
            "Demo YouTube Worship Video",
            "demodata-main-team",
            MediaContent::YouTube {
                video_id: "dQw4w9WgXcQ".into(),
                canonical_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ".into(),
            },
        ),
        (
            "spotify",
            "Demo Spotify Track",
            "demodata-main-team",
            MediaContent::Spotify {
                resource_type: SpotifyResourceType::Track,
                spotify_id: "4iV5W9uYEdYUVa79Axb7Rh".into(),
                canonical_url: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh".into(),
            },
        ),
        (
            "webpage",
            "Demo Service Notes",
            "demodata-main-team",
            MediaContent::WebPage {
                url: "https://example.com/worship-notes".into(),
            },
        ),
        (
            "livestream",
            "Demo Livestream",
            "demodata-archive-team",
            MediaContent::Livestream {
                url: "https://example.com/live.m3u8".into(),
                stream_type: LivestreamType::Hls,
            },
        ),
        (
            "archive-video",
            "Demo Archive Video",
            "demodata-archive-team",
            MediaContent::YouTube {
                video_id: "jNQXAC9IVRw".into(),
                canonical_url: "https://www.youtube.com/watch?v=jNQXAC9IVRw".into(),
            },
        ),
        (
            "archive-page",
            "Demo Archive Page",
            "demodata-archive-team",
            MediaContent::WebPage {
                url: "https://example.com/archive".into(),
            },
        ),
    ];
    for (id, title, owner, content) in media_specs {
        let media = MediaRecord::from_write(
            None,
            Some(RecordId::new("team", owner)),
            MediaWrite {
                title: title.to_owned(),
                content,
                pending_revision: None,
            },
        )?;
        upsert(db, RecordId::new("media", format!("demodata-{id}")), media).await?;
        summary.media += 1;
    }

    let setlists = [
        (
            "sunday-service",
            "Sunday Service",
            "demodata-main-team",
            (0..8).map(|index| song_item(index, true)).collect(),
        ),
        (
            "youth-night",
            "Youth Night",
            "demodata-main-team",
            (12..20).map(|index| song_item(index, false)).collect(),
        ),
        (
            "bilingual-service",
            "Bilingual Service",
            "demodata-main-team",
            (20..25).map(bilingual_song_item).collect(),
        ),
        (
            "empty-setlist",
            "Empty Setlist",
            "demodata-main-team",
            vec![],
        ),
        (
            "archive-mixed",
            "Archive Mixed Media",
            "demodata-archive-team",
            vec![
                song_item(60, false),
                SetlistItem::media("demodata-livestream"),
                song_item(61, true),
                song_item(60, false),
                SetlistItem::media("demodata-archive-video"),
            ],
        ),
        (
            "private-rehearsal",
            "Private Rehearsal",
            "demodata-team-admin-personal",
            (80..85).map(|index| song_item(index, true)).collect(),
        ),
    ];
    for (id, title, owner, items) in setlists {
        let setlist = SetlistRecord::from_payload(
            None,
            Some(RecordId::new("team", owner)),
            CreateSetlist {
                owner: None,
                title: title.to_owned(),
                items,
            },
        );
        upsert(
            db,
            RecordId::new("setlist", format!("demodata-{id}")),
            setlist,
        )
        .await?;
        summary.setlists += 1;
    }

    let likes = [
        ("demodata-guest", 0),
        ("demodata-guest", 3),
        ("demodata-guest", 20),
        ("demodata-maintainer", 60),
        ("demodata-team-admin", 1),
        ("demodata-team-admin", 80),
    ];
    for (user, index) in likes {
        let like = LikeRecord::new(user_thing(user), song_thing(&song_id(index)));
        upsert(
            db,
            RecordId::new("like", format!("demodata-{user}-{index}")),
            like,
        )
        .await?;
        summary.likes += 1;
    }

    Ok(summary)
}

fn member(user: &str, role: &str) -> DbTeamMember {
    DbTeamMember {
        user: user_thing(user),
        role: role.to_owned(),
    }
}

fn user_thing(id: &str) -> RecordId {
    RecordId::new("user", id.to_owned())
}

fn song_thing(id: &str) -> RecordId {
    RecordId::new("song", id.to_owned())
}

fn song_id(index: usize) -> String {
    format!("demodata-song-{index:03}")
}

fn song_data(index: usize) -> SongData {
    let bilingual = index.is_multiple_of(5);
    let languages = if index.is_multiple_of(13) {
        vec!["en".into(), "de".into(), "es".into()]
    } else if bilingual {
        vec!["en".into(), "de".into()]
    } else {
        vec!["en".into()]
    };
    let titles = if bilingual || index.is_multiple_of(4) {
        vec![
            format!("Demo Song {:03}", index + 1),
            format!("Demo Alternate {:03}", index + 1),
        ]
    } else {
        vec![format!("Demo Song {:03}", index + 1)]
    };
    let mut tags = BTreeMap::new();
    tags.insert(
        "theme".into(),
        ["praise", "prayer", "communion", "seasonal"][index % 4].into(),
    );
    if index.is_multiple_of(3) {
        tags.insert("difficulty".into(), "easy".into());
    }

    let sections = if index.is_multiple_of(10) {
        vec![]
    } else {
        let mut sections = vec![
            Section::new(
                "Verse".into(),
                vec![Line::new(vec![Part {
                    chord: Some(Chord::new((index % 12) as u8)),
                    languages: localized_lines(index, &languages, "We gather in your light"),
                    comment: false,
                }])],
            ),
            Section::new_with_repeat(
                "Chorus".into(),
                vec![Line::new(vec![
                    Part {
                        chord: Some(Chord::new(((index + 5) % 12) as u8).major()),
                        languages: localized_lines(
                            index,
                            &languages,
                            "Your love will lead us home",
                        ),
                        comment: false,
                    },
                    Part {
                        chord: None,
                        languages: localized_lines(
                            index,
                            &languages,
                            "Your love will lead us home",
                        ),
                        comment: false,
                    },
                ])],
                if index.is_multiple_of(7) { 2 } else { 1 },
            ),
        ];
        if index.is_multiple_of(6) {
            sections.push(Section::new(
                "Bridge".into(),
                vec![Line::new(vec![Part {
                    chord: Some(Chord::new(((index + 8) % 12) as u8).minor()),
                    languages: localized_lines(index, &languages, "Make our hearts ready"),
                    comment: false,
                }])],
            ));
        }
        sections
    };

    SongData {
        titles,
        subtitle: index
            .is_multiple_of(5)
            .then(|| "A demo song for testing".into()),
        copyright: index
            .is_multiple_of(2)
            .then(|| "© Worship Viewer Demo".into()),
        key: (!index.is_multiple_of(3)).then(|| SimpleChord::new((index % 12) as u8)),
        artists: if index.is_multiple_of(6) {
            vec!["Demo Band".into(), "Guest Artist".into()]
        } else {
            vec!["Demo Band".into()]
        },
        languages,
        tempo: (!index.is_multiple_of(4)).then_some(72 + ((index * 7) % 70) as u32),
        time: Some(if index.is_multiple_of(5) {
            (3, 4)
        } else {
            (4, 4)
        }),
        tags,
        sections,
    }
}

fn localized_lines(index: usize, languages: &[String], text: &str) -> Vec<String> {
    languages
        .iter()
        .enumerate()
        .map(|(language, _)| match language {
            1 => format!("{text} · Lied {index:03}"),
            2 => format!("{text} · Canción {index:03}"),
            _ => format!("{text} · Song {index:03}"),
        })
        .collect()
}

fn song_item(index: usize, overrides: bool) -> SetlistItem {
    SetlistItem::Song(SetlistSongLink {
        id: song_id(index),
        nr: Some((index + 1).to_string()),
        key: overrides.then(|| SimpleChord::new(((index + 2) % 12) as u8)),
        tempo: overrides.then_some(96 + (index as u32 % 4) * 4),
        language: None,
        flow: overrides.then(|| {
            vec![SongFlowItem {
                title: "Chorus".into(),
                occurrence_index: 0,
                repeats: 2,
            }]
        }),
    })
}

fn bilingual_song_item(index: usize) -> SetlistItem {
    SetlistItem::Song(SetlistSongLink {
        id: song_id(index),
        nr: Some((index - 19).to_string()),
        key: None,
        tempo: None,
        language: Some(if index.is_multiple_of(2) { "de" } else { "en" }.into()),
        flow: None,
    })
}

async fn upsert<T>(db: &Database, id: RecordId, value: T) -> AnyResult<()>
where
    T: SurrealValue,
{
    let _: Option<T> = db
        .db
        .upsert(id)
        .content(value)
        .await
        .context("failed to upsert demodata record")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::test_db;

    #[test]
    fn scenario_parsing() {
        assert_eq!(Scenario::parse(None).unwrap(), None);
        assert_eq!(
            Scenario::parse(Some("generic")).unwrap(),
            Some(Scenario::Generic)
        );
        assert_eq!(
            Scenario::parse(Some("GENERIC")).unwrap(),
            Some(Scenario::Generic)
        );
        assert!(
            Scenario::parse(Some("acl"))
                .unwrap_err()
                .to_string()
                .contains("unknown DEMODATA")
        );
    }

    #[test]
    fn scenario_is_rejected_in_production() {
        assert!(validate_environment(true, Some(Scenario::Generic)).is_err());
        assert!(validate_environment(false, Some(Scenario::Generic)).is_ok());
        assert!(validate_environment(true, None).is_ok());
    }

    #[test]
    fn song_fixture_has_metadata_variety() {
        let songs: Vec<SongData> = (0..100).map(song_data).collect();
        assert_eq!(songs.len(), 100);
        assert!(songs.iter().any(|song| song.sections.is_empty()));
        assert!(songs.iter().any(|song| song.sections.len() >= 3));
        assert!(songs.iter().any(|song| song.languages.len() > 1));
        assert!(songs.iter().any(|song| song.key.is_some()));
        assert!(songs.iter().any(|song| song.tags.contains_key("theme")));
    }

    #[tokio::test]
    async fn generic_seed_is_idempotent_and_has_expected_counts() {
        let db = test_db().await.unwrap();
        seed(&db, Scenario::Generic).await.unwrap();
        seed(&db, Scenario::Generic).await.unwrap();

        for (table, expected) in [
            ("user", 5),
            ("team", 7),
            ("song", 100),
            ("collection", 8),
            ("setlist", 6),
            ("media", 6),
            ("like", 6),
            ("demodata_seed", 1),
        ] {
            let query = format!("SELECT count() AS count FROM {table} GROUP ALL");
            let mut response = db.db.query(query).await.unwrap();
            let rows: Vec<serde_json::Value> = response.take(0).unwrap();
            let count = rows
                .first()
                .and_then(|row| row["count"].as_u64())
                .unwrap_or(0);
            assert_eq!(count, expected, "unexpected count for {table}");
        }

        let mut response = db
            .db
            .query("SELECT not_a_song, data.languages, data.tags, data.sections FROM song")
            .await
            .unwrap();
        let songs: Vec<serde_json::Value> = response.take(0).unwrap();
        assert!(songs.iter().any(|song| song["not_a_song"] == true));
        assert!(
            songs
                .iter()
                .any(|song| song["data"]["languages"].as_array().unwrap().len() > 1)
        );
        assert!(
            songs
                .iter()
                .any(|song| !song["data"]["sections"].as_array().unwrap().is_empty())
        );
    }
}
