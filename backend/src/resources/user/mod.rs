pub use shared::user::{CreateUser, Role, User};

mod model;
pub use model::UserRecord;

pub mod repository;
pub use repository::UserRepository;

mod surreal_repo;
pub use surreal_repo::SurrealUserRepo;

pub mod service;
pub use service::{UserService, UserServiceHandle};

pub(crate) mod profile_picture;

pub mod rest;

pub mod session;
