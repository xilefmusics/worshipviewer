//! OpenAPI schema for the ChordPro-derived song payload (mirrors [`chordlib::types::Song`] wire JSON).
//! Runtime types use `chordlib::types::Song` directly; these types exist for `utoipa` only.

use std::collections::BTreeMap;

#[cfg(feature = "backend")]
#[allow(unused_imports)]
use serde_json::json;
#[cfg(feature = "backend")]
use utoipa::ToSchema;

/// Chromatic pitch class (song key, chord root, or slash bass).
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(feature = "backend", schema(as = SimpleChord))]
pub struct SimpleChordSchema {
    /// Pitch class: 0 = C, 1 = C#/Db, …, 11 = B.
    #[cfg_attr(feature = "backend", schema(example = 7, minimum = 0, maximum = 11))]
    pub level: u8,
}

/// Chord quality on the wire (`kind` field of [`ChordSchema`]).
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(feature = "backend", schema(as = Kind))]
pub enum ChordKindSchema {
    Major,
    Minor,
    Diminished,
    Augmented,
    Suspended2,
    Suspended4,
}

/// Accidental spelling hint from the parsed root token (`#` vs `b`).
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(rename_all = "snake_case", as = RootSpellingHint)
)]
pub enum RootSpellingHintSchema {
    Default,
    PreferSharp,
    PreferFlat,
}

/// Structured chord attached to a lyric [`PartSchema`].
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(feature = "backend", schema(as = Chord))]
pub struct ChordSchema {
    pub main: SimpleChordSchema,
    pub base: Option<SimpleChordSchema>,
    pub kind: ChordKindSchema,
    /// Extensions and figures after the quality (e.g. `7`, `add9`, `sus4`).
    pub var: String,
    /// Duration in milliclicks (1000 per ChordPro click in `{chord:…:N}`).
    pub duration: Option<u32>,
    #[cfg_attr(feature = "backend", schema(default))]
    pub optional: bool,
    #[cfg_attr(feature = "backend", schema(default))]
    pub root_spelling_hint: RootSpellingHintSchema,
}

/// One lyric/chord fragment on a line.
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(feature = "backend", schema(as = Part))]
pub struct PartSchema {
    pub chord: Option<ChordSchema>,
    /// Lyric text per language **track** (index aligns with song-level `languages`; not BCP 47 codes).
    pub languages: Vec<String>,
    /// When true, `languages` holds a ChordPro comment line, not lyrics.
    pub comment: bool,
}

/// A single lyric line made of aligned [`PartSchema`] fragments.
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(feature = "backend", schema(as = Line))]
pub struct LineSchema {
    pub parts: Vec<PartSchema>,
}

/// Verse, chorus, bridge, etc.
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(feature = "backend", schema(as = Section))]
pub struct SectionSchema {
    pub title: String,
    pub lines: Vec<LineSchema>,
    /// Times this section repeats (`{repeat}` / `{repeat: N}`). Default 1 when omitted on input.
    #[cfg_attr(feature = "backend", schema(example = 1, minimum = 1))]
    pub repeat_count: Option<u32>,
}

/// ChordPro-derived metadata and content (titles, tags, [`sections`](https://chordpro.org/) as structured blocks).
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
            "titles": ["Amazing Grace"],
            "subtitle": null,
            "copyright": null,
            "key": { "level": 7 },
            "artists": [],
            "languages": ["en"],
            "tempo": null,
            "time": null,
            "tags": {},
            "sections": [{
                "title": "Verse",
                "lines": [{
                    "parts": [{
                        "chord": {
                            "main": { "level": 0 },
                            "base": null,
                            "kind": "Major",
                            "var": "",
                            "duration": null,
                            "optional": false,
                            "root_spelling_hint": "default"
                        },
                        "languages": ["Amazing grace"],
                        "comment": false
                    }]
                }],
                "repeat_count": 1
            }]
        })
    )
)]
pub struct SongDataSchema {
    /// Primary and alternate titles from ChordPro `{title}` / `{title:N}` directives.
    #[cfg_attr(
        feature = "backend",
        schema(example = json!(["Example Hymn"]))
    )]
    pub titles: Option<Vec<String>>,
    pub subtitle: Option<String>,
    pub copyright: Option<String>,
    /// Tonic pitch class for the song (transposition / display reference).
    #[cfg_attr(
        feature = "backend",
        schema(value_type = Option<SimpleChordSchema>, example = json!({"level": 7}))
    )]
    pub key: Option<chordlib::types::SimpleChord>,
    pub artists: Option<Vec<String>>,
    /// BCP 47 language tags for lyric tracks (e.g. `en`, `de-CH`). Empty string when unset.
    #[cfg_attr(feature = "backend", schema(example = json!(["en"])))]
    pub languages: Option<Vec<String>>,
    /// Tempo in BPM (beats per minute).
    pub tempo: Option<u32>,
    /// Time signature as `(numerator, denominator)` (e.g. 4/4).
    #[cfg_attr(feature = "backend", schema(value_type = Option<[u32; 2]>, example = json!([4, 4])))]
    pub time: Option<(u32, u32)>,
    /// Custom meta tags from ChordPro `{meta: name value}` pairs. Omitted on the wire when empty.
    #[cfg_attr(feature = "backend", schema(additional_properties = true))]
    pub tags: Option<BTreeMap<String, String>>,
    /// Structured sections (verse, chorus, etc.) with lyric lines and chords.
    #[cfg_attr(feature = "backend", schema(value_type = Vec<SectionSchema>))]
    pub sections: Vec<chordlib::types::Section>,
}
