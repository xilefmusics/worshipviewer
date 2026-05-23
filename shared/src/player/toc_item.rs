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

/// Resolve a song-link display number, falling back to a 1-based index when absent or blank.
pub fn resolve_toc_nr(nr: Option<&str>, fallback_index: usize) -> String {
    nr.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| fallback_index.to_string())
}

#[cfg(test)]
mod tests {
    use super::resolve_toc_nr;

    #[test]
    fn resolve_toc_nr_uses_explicit_value() {
        assert_eq!(resolve_toc_nr(Some("3b"), 1), "3b");
    }

    #[test]
    fn resolve_toc_nr_trims_whitespace() {
        assert_eq!(resolve_toc_nr(Some("  2  "), 1), "2");
    }

    #[test]
    fn resolve_toc_nr_falls_back_when_missing_or_blank() {
        assert_eq!(resolve_toc_nr(None, 4), "4");
        assert_eq!(resolve_toc_nr(Some(""), 4), "4");
        assert_eq!(resolve_toc_nr(Some("   "), 4), "4");
    }
}
