pub use shared::song::{CreateSong, PatchSong, PatchSongData, Song, UpdateSong};

mod liked;
mod model;
mod repository;
pub mod service;
mod surreal_repo;

pub use liked::LikedSongIds;
pub use model::{LikeRecord, SongDataField, SongRecord, search_content_from_song_data};
pub use repository::{SongRepository, SongUpsertOutcome};
pub use service::{SongService, SongServiceHandle};
pub use surreal_repo::SurrealSongRepo;

pub mod rest;
