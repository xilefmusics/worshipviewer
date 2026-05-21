pub use shared::collection::{
    Collection, CreateCollection, PatchCollection, TransferCollectionSong,
    TransferCollectionSongResult, UpdateCollection,
};

mod model;
mod repository;
pub mod service;
mod surreal_repo;

pub use repository::CollectionRepository;
pub use service::{CollectionService, CollectionServiceHandle};
pub use surreal_repo::SurrealCollectionRepo;

pub mod rest;
