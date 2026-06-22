use super::Song;
use chordlib::types::SimpleChord;
use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
use super::song_data_schema::SimpleChordSchema;
#[cfg(feature = "backend")]
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(feature = "backend", schema(as = FlowSlot))]
pub struct FlowSlot {
    /// Exact section title as stored in the ChordPro song data.
    pub section_title: String,
    /// Zero-based occurrence among content-bearing sections with the same title.
    pub occurrence_index: u32,
    /// Number of times this slot repeats in Book / player rendering.
    pub repeat_count: u32,
}

impl FlowSlot {
    pub fn validate(&self) -> Result<(), String> {
        if self.section_title.trim().is_empty() {
            return Err("flow section title must not be empty".into());
        }
        if self.repeat_count == 0 {
            return Err("flow repeat count must be at least 1".into());
        }
        Ok(())
    }
}

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(feature = "backend", schema(as = SongLink))]
pub struct Link {
    /// Song record id.
    pub id: String,
    /// Optional display position in the parent list (e.g. `1`, `2a`).
    pub nr: Option<String>,
    /// Transposition key for this slot (same `{ "level": … }` object as `Song.data.key`).
    #[cfg_attr(feature = "backend", schema(value_type = Option<SimpleChordSchema>))]
    pub key: Option<SimpleChord>,
    /// Tempo override in BPM for this slot; `None` inherits the song's `data.tempo`.
    pub tempo: Option<u32>,
    /// Language override for this slot; `None` inherits the song's default language.
    pub language: Option<String>,
    /// Optional custom flow override for this slot; `None` preserves the source song order.
    pub flow: Option<Vec<FlowSlot>>,
}

pub struct LinkOwned {
    pub song: Song,
    pub nr: Option<String>,
    pub key: Option<SimpleChord>,
    pub tempo: Option<u32>,
    pub language: Option<String>,
    pub flow: Option<Vec<FlowSlot>>,
    pub liked: bool,
}

impl Link {
    pub fn validate(&self) -> Result<(), String> {
        let Some(flow) = self.flow.as_ref() else {
            return Ok(());
        };
        if flow.is_empty() {
            return Err("flow must not be empty".into());
        }
        for slot in flow {
            slot.validate()?;
        }
        Ok(())
    }
}
