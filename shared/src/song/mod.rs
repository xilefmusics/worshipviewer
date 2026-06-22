mod link;
#[allow(clippy::module_inception)]
mod song;
#[cfg(feature = "backend")]
mod song_data_schema;

pub use chordlib::outputs::{wrap_html, CharPageSet, FormatOutputLines, OutputLine};
pub use chordlib::types::{ChordRepresentation, SimpleChord};
pub use link::{Link, LinkOwned};
pub use song::{CreateSong, PatchSong, PatchSongData, Song, SongUserSpecificAddons, UpdateSong};
#[cfg(feature = "backend")]
pub use song_data_schema::{
    ChordKindSchema, ChordSchema, LineSchema, PartSchema, RootSpellingHintSchema, SectionSchema,
    SimpleChordSchema, SongDataSchema, SongFlowItemSchema,
};
