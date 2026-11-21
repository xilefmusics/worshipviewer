use serde::{Deserialize, Serialize};
#[cfg(feature = "backend")]
use utoipa::ToSchema;

/// Geometry mask drawn over an AV background.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum AvGeometryOverlay {
    None,
    Cross,
    InvertedCross,
    SlicedSquare,
    SlicedRectangle,
    SlicedRectangleThree,
    Circle,
    Square,
    Rectangle,
    Triangle,
    InvertedTriangle,
    Diamond,
    Heart,
    Gospel,
}

/// Background settings selected for a setlist song slot or AV player TOC entry.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerBackground {
    pub preset: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<PlayerBackgroundImage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video: Option<PlayerBackgroundVideo>,
    /// Optional geometry overlay; omitted by legacy source-only overrides, which inherit the player value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_overlay: Option<AvGeometryOverlay>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_overlay_rotated_background: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_overlay_opacity: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_overlay_color: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_overlay_size: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_overlay_thickness: Option<u8>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum AvTextAlign {
    Left,
    Center,
    Right,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum AvVerticalAlign {
    Top,
    GeometryCenter,
    Center,
    Bottom,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum AvHorizontalAlign {
    Left,
    Center,
    Right,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum AvTextShadow {
    None,
    Subtle,
    Medium,
    Strong,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum AvTextTransform {
    None,
    Uppercase,
    Lowercase,
    Capitalize,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum AvFontFamily {
    Rubik,
    Arial,
    Verdana,
    TrebuchetMs,
    Tahoma,
    Georgia,
    Palatino,
    Garamond,
}

/// Complete AV text styling snapshot for a setlist song slot.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerContentLayer {
    pub max_lines_per_slide: u8,
    pub balance_slide_lines: bool,
    pub font_size: u8,
    pub font_family: AvFontFamily,
    pub text_align: AvTextAlign,
    pub vertical_align: AvVerticalAlign,
    pub horizontal_align: AvHorizontalAlign,
    pub text_shadow: AvTextShadow,
    pub text_transform: AvTextTransform,
    pub primary_text_lightness: u8,
    pub secondary_text_lightness: u8,
}

/// Complete AV foreground snapshot for a setlist song slot.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerForegroundSettings {
    pub content_layer: PlayerContentLayer,
    pub bilingual_enabled: bool,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_source_only_background_inherits_geometry_settings() {
        let background: PlayerBackground = serde_json::from_value(serde_json::json!({
            "preset": 2,
            "image": { "media_id": "media-bg", "asset_id": "asset-bg" }
        }))
        .unwrap();

        assert_eq!(background.preset, 2);
        assert_eq!(background.geometry_overlay, None);
        assert_eq!(background.geometry_overlay_rotated_background, None);
        assert_eq!(background.geometry_overlay_opacity, None);
        assert_eq!(background.geometry_overlay_color, None);
        assert_eq!(background.geometry_overlay_size, None);
        assert_eq!(background.geometry_overlay_thickness, None);
    }
}
