use serde::{Deserialize, Serialize};
#[cfg(feature = "backend")]
use utoipa::ToSchema;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct TocItem {
    pub idx: usize,
    pub title: String,
    /// Optional stable id when this TOC row links to a concrete song.
    pub id: Option<String>,
    /// Display number/label for this TOC row.
    pub nr: String,
    pub liked: bool,
}
