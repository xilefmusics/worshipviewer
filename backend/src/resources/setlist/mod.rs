pub use shared::setlist::{CreateSetlist, PatchSetlist, Setlist, UpdateSetlist};

mod model;
mod repository;
pub mod service;
mod surreal_repo;

pub use model::SetlistRecord;
pub use repository::SetlistRepository;
pub use service::{SetlistService, SetlistServiceHandle};
pub use surreal_repo::SurrealSetlistRepo;

pub mod rest;
