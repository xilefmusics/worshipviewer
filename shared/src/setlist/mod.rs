#[allow(clippy::module_inception)]
mod setlist;

pub use setlist::SongLink;
pub use setlist::{CreateSetlist, PatchSetlist, Setlist, UpdateSetlist};
