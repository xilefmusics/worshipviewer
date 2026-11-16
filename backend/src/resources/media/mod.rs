pub use shared::media::{
    CommitDeck, CreateMedia, CreateMediaContent, CreateUploadSession, CreateUploadedMedia,
    DuplicateMedia, LivestreamType, Media, MediaContent, MediaDeckPage, MediaPendingRevision,
    MediaStagedDeckPage, SpotifyResourceType, UpdateMedia, UploadSession, UploadSessionTarget,
    UploadSourceDescriptor, UploadedMediaKind,
};

mod model;
mod repository;
pub mod rest;
pub mod service;
mod surreal_repo;

pub mod deck_processor;
pub mod processing;

pub use model::{MediaRecord, MediaWrite};
pub use repository::MediaRepository;
pub use service::{MediaService, MediaServiceHandle};
pub use surreal_repo::SurrealMediaRepo;
