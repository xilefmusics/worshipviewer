use serde::{Deserialize, Serialize};
#[cfg(feature = "backend")]
use utoipa::ToSchema;

/// Background selected for a setlist song slot or AV player TOC entry.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerBackground {
    pub preset: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<PlayerBackgroundImage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video: Option<PlayerBackgroundVideo>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerBackgroundImage {
    pub media_id: String,
    pub asset_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerBackgroundVideo {
    pub media_id: String,
    pub asset_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail_asset_id: Option<String>,
}
