use chordlib::types::SongFlowItem;
use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
use crate::song::SongFlowItemSchema;
#[cfg(feature = "backend")]
#[allow(unused_imports)]
use serde_json::json;
#[cfg(feature = "backend")]
use utoipa::ToSchema;

/// Ordered setlist slot: a song with optional overrides, or a Media id.
#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum SetlistItem {
    Song(SongLink),
    Media(SetlistMediaLink),
}

impl SetlistItem {
    pub fn song(link: SongLink) -> Self {
        Self::Song(link)
    }

    pub fn media(id: impl Into<String>) -> Self {
        Self::Media(SetlistMediaLink { id: id.into() })
    }

    pub fn as_song(&self) -> Option<&SongLink> {
        match self {
            Self::Song(link) => Some(link),
            Self::Media(_) => None,
        }
    }

    pub fn as_media_id(&self) -> Option<&str> {
        match self {
            Self::Song(_) => None,
            Self::Media(link) => Some(link.id.as_str()),
        }
    }

    pub fn is_song(&self) -> bool {
        matches!(self, Self::Song(_))
    }

    pub fn is_media(&self) -> bool {
        matches!(self, Self::Media(_))
    }
}

/// Player hydration mode for a setlist snapshot.
#[derive(Serialize, Deserialize, Debug, Default, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum SetlistPlayerView {
    /// Book/sheet, text-only, PDF/ZIP, offline, and Room snapshots. Media is omitted.
    #[default]
    Book,
    /// Online AV: Ready readable Media is included as one tagged item per setlist slot.
    Av,
}

impl SetlistPlayerView {
    pub fn includes_media(self) -> bool {
        matches!(self, Self::Av)
    }
}

/// Filter persisted slots for a player view without hydrating content.
pub fn items_for_player_view(items: &[SetlistItem], view: SetlistPlayerView) -> Vec<&SetlistItem> {
    items
        .iter()
        .filter(|item| item.is_song() || view.includes_media())
        .collect()
}

/// Song slots in persisted order. Media is omitted (exports, Book, `/songs`).
pub fn song_links(items: &[SetlistItem]) -> Vec<&SongLink> {
    items.iter().filter_map(SetlistItem::as_song).collect()
}

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "id": "set_example",
        "owner": "usr_example",
        "title": "Easter Sunday",
        "items": [
            { "type": "song", "id": "song_example", "nr": "1", "key": null, "flow": null },
            { "type": "media", "id": "media_example" }
        ]
    }))
)]
pub struct Setlist {
    pub id: String,
    pub owner: String,
    pub title: String,
    pub items: Vec<SetlistItem>,
}

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(feature = "backend", schema(as = SetlistSongLink))]
pub struct SongLink {
    /// Song record id.
    pub id: String,
    /// Optional display position in the parent list (e.g. `1`, `2a`).
    pub nr: Option<String>,
    /// Transposition key for this slot (same `{ "level": … }` object as `Song.data.key`).
    #[cfg_attr(feature = "backend", schema(value_type = Option<crate::song::SimpleChordSchema>))]
    pub key: Option<chordlib::types::SimpleChord>,
    /// Tempo override in BPM for this slot; `None` inherits the song's `data.tempo`.
    pub tempo: Option<u32>,
    /// Language override for this slot; `None` inherits the song's default language.
    pub language: Option<String>,
    /// Custom section order and repeats for this setlist slot.
    #[cfg_attr(feature = "backend", schema(value_type = Option<Vec<SongFlowItemSchema>>))]
    pub flow: Option<Vec<SongFlowItem>>,
}

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct SetlistMediaLink {
    /// Media record id.
    pub id: String,
}

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "title": "Easter Sunday",
        "items": [{ "type": "song", "id": "song_example", "nr": "1", "key": null, "flow": null }],
        "owner": "team_example_id"
    }))
)]
pub struct CreateSetlist {
    /// Owning team id (same format as `Setlist.owner` in responses). Omit to create under the caller's personal team.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    pub title: String,
    pub items: Vec<SetlistItem>,
}

/// Full replacement body for `PUT /api/v1/setlists/{id}`.
#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct UpdateSetlist {
    pub title: String,
    pub items: Vec<SetlistItem>,
    /// Target team id for the setlist's `owner`; omit or `null` to keep the current owner.
    #[serde(default)]
    pub owner: Option<String>,
}

impl From<CreateSetlist> for UpdateSetlist {
    fn from(value: CreateSetlist) -> Self {
        Self {
            title: value.title,
            items: value.items,
            owner: None,
        }
    }
}

impl From<UpdateSetlist> for CreateSetlist {
    fn from(value: UpdateSetlist) -> Self {
        Self {
            owner: None,
            title: value.title,
            items: value.items,
        }
    }
}

/// Partial update for a setlist. Absent fields are left unchanged.
#[derive(Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PatchSetlist {
    pub title: Option<String>,
    pub items: Option<Vec<SetlistItem>>,
    #[serde(default)]
    pub owner: Option<String>,
}

impl From<Setlist> for CreateSetlist {
    fn from(value: Setlist) -> Self {
        Self {
            owner: None,
            title: value.title,
            items: value.items,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn song_link(id: &str) -> SongLink {
        SongLink {
            id: id.into(),
            nr: Some("1".into()),
            key: Some(chordlib::types::SimpleChord::new(3)),
            tempo: Some(88),
            language: Some("de".into()),
            flow: Some(vec![chordlib::types::SongFlowItem {
                title: "Verse".into(),
                occurrence_index: 0,
                repeats: 2,
            }]),
        }
    }

    #[test]
    fn tagged_items_roundtrip_mixed_order_and_duplicates() {
        let items = vec![
            SetlistItem::song(song_link("s1")),
            SetlistItem::media("m1"),
            SetlistItem::song(song_link("s1")),
            SetlistItem::media("m1"),
        ];
        let json = serde_json::to_value(&items).expect("serialize");
        assert_eq!(json[0]["type"], "song");
        assert_eq!(json[1]["type"], "media");
        assert_eq!(json[2]["id"], "s1");
        assert_eq!(json[3]["id"], "m1");
        let back: Vec<SetlistItem> = serde_json::from_value(json).expect("deserialize");
        assert_eq!(back, items);
        assert_eq!(back[0].as_song().unwrap().tempo, Some(88));
        assert_eq!(back[0].as_song().unwrap().language.as_deref(), Some("de"));
        assert_eq!(
            back[0].as_song().unwrap().flow.as_ref().unwrap()[0].title,
            "Verse"
        );
    }

    #[test]
    fn media_item_rejects_song_fields() {
        let value = json!({ "type": "media", "id": "m1", "key": { "level": 0 } });
        assert!(serde_json::from_value::<SetlistItem>(value).is_err());
    }

    #[test]
    fn unknown_item_tag_is_rejected() {
        let value = json!({ "type": "blob", "id": "x" });
        assert!(serde_json::from_value::<SetlistItem>(value).is_err());
    }

    #[test]
    fn songs_field_is_rejected_on_create() {
        let value = json!({
            "title": "Sunday",
            "songs": [{ "id": "s1" }]
        });
        assert!(serde_json::from_value::<CreateSetlist>(value).is_err());
    }

    #[test]
    fn items_for_player_view_omits_media_in_book() {
        let items = vec![
            SetlistItem::media("m1"),
            SetlistItem::song(song_link("s1")),
            SetlistItem::media("m2"),
            SetlistItem::song(song_link("s2")),
        ];
        let book = items_for_player_view(&items, SetlistPlayerView::Book);
        assert_eq!(book.len(), 2);
        assert_eq!(book[0].as_song().unwrap().id, "s1");
        assert_eq!(book[1].as_song().unwrap().id, "s2");
        let av = items_for_player_view(&items, SetlistPlayerView::Av);
        assert_eq!(av.len(), 4);
    }

    #[test]
    fn song_links_skips_media_and_preserves_duplicate_song_slots() {
        let items = vec![
            SetlistItem::song(song_link("s1")),
            SetlistItem::media("m1"),
            SetlistItem::song(song_link("s1")),
        ];
        let songs = song_links(&items);
        assert_eq!(songs.len(), 2);
        assert_eq!(songs[0].id, "s1");
        assert_eq!(songs[1].id, "s1");
        assert_eq!(songs[0].nr.as_deref(), Some("1"));
    }

    #[test]
    fn empty_items_roundtrip() {
        let created = CreateSetlist {
            owner: None,
            title: "Empty".into(),
            items: vec![],
        };
        let json = serde_json::to_value(&created).expect("serialize");
        assert_eq!(json["items"], json!([]));
        let back: CreateSetlist = serde_json::from_value(json).expect("deserialize");
        assert!(back.items.is_empty());
    }
}
