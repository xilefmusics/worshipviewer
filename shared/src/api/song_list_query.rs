use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
#[allow(unused_imports)]
use serde_json::json;

use super::ListQuery;

/// Query parameters for `GET /api/v1/songs`: pagination plus optional sort and filters.
///
/// Pagination fields mirror [`ListQuery`] (they are not `flatten`ed so `actix_web::Query`
/// deserializes reliably from `application/x-www-form-urlencoded` query strings).
#[cfg_attr(feature = "backend", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "page": 0,
        "page_size": 50,
        "q": "grace",
        "team": "team_example",
        "sort": "-id"
    }))
)]
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct SongListQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub q: Option<String>,
    pub team: Option<String>,
    /// Sort: comma-separated fields, `-` prefix for descending (e.g. `-id`, `title`, `-id,title`).
    /// Use `relevance` when searching (`q` non-empty). Legacy tokens (`id_desc`, …) accepted with a warning.
    #[cfg_attr(feature = "backend", schema(value_type = Option<String>, example = "-id"))]
    pub sort: Option<String>,
    /// Filter to songs whose `data.languages` contains this string (exact match on an array element).
    pub lang: Option<String>,
    /// Case-insensitive substring match against the stringified `data.tags` object (keys and values).
    pub tag: Option<String>,
}

/// Parsed sort order for `/songs` queries (see [`SongSort::from_sort_param`]).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SongSort {
    /// Newest record id first (default when `q` is absent).
    #[default]
    IdDesc,
    IdAsc,
    TitleAsc,
    TitleDesc,
    /// Search relevance (default when `q` is present); uses full-text scores.
    Relevance,
}

impl SongSort {
    /// Parse `sort` query value: **canonical** (`-id`, `title`, `relevance`, comma-separated, first wins)
    /// plus **legacy** snake_case tokens (`id_desc`, …) for one release.
    pub fn from_sort_param(raw: &str) -> Result<Self, String> {
        let s = raw.trim();
        if s.is_empty() {
            return Err("sort is empty".into());
        }
        let first = s.split(',').next().unwrap_or("").trim();
        match first {
            "id_desc" => {
                legacy_sort_warn("id_desc");
                return Ok(Self::IdDesc);
            }
            "id_asc" => {
                legacy_sort_warn("id_asc");
                return Ok(Self::IdAsc);
            }
            "title_asc" => {
                legacy_sort_warn("title_asc");
                return Ok(Self::TitleAsc);
            }
            "title_desc" => {
                legacy_sort_warn("title_desc");
                return Ok(Self::TitleDesc);
            }
            _ => {}
        }
        if first.eq_ignore_ascii_case("relevance") {
            return Ok(Self::Relevance);
        }
        let desc = first.starts_with('-');
        let field = first.trim_start_matches('-').trim();
        match field {
            "id" => Ok(if desc { Self::IdDesc } else { Self::IdAsc }),
            "title" => Ok(if desc {
                Self::TitleDesc
            } else {
                Self::TitleAsc
            }),
            _ => Err(format!("unknown sort field: {field}")),
        }
    }

    fn canonical_sort_param(self) -> &'static str {
        match self {
            Self::IdDesc => "-id",
            Self::IdAsc => "id",
            Self::TitleAsc => "title",
            Self::TitleDesc => "-title",
            Self::Relevance => "relevance",
        }
    }
}

fn legacy_sort_warn(token: &str) {
    #[cfg(feature = "backend")]
    tracing::warn!(
        legacy_sort_token = token,
        "deprecated sort=… token; use JSON:API-style sort (e.g. -id, title) instead"
    );
    #[cfg(not(feature = "backend"))]
    let _ = token;
}

impl From<ListQuery> for SongListQuery {
    fn from(list: ListQuery) -> Self {
        Self {
            page: list.page,
            page_size: list.page_size,
            q: list.q,
            team: list.team,
            sort: None,
            lang: None,
            tag: None,
        }
    }
}

impl SongListQuery {
    /// Same pagination semantics as [`ListQuery`].
    pub fn list_query(&self) -> ListQuery {
        ListQuery {
            page: self.page,
            page_size: self.page_size,
            q: self.q.clone(),
            team: self.team.clone(),
        }
    }

    /// Validates pagination ([`ListQuery::validate`]) and sort vs `q` rules.
    pub fn validate(self) -> Result<Self, String> {
        self.list_query().validate()?;
        let q_nonempty = self.q.as_ref().is_some_and(|q| !q.trim().is_empty());
        if let Some(ref st) = self.sort {
            let parsed = SongSort::from_sort_param(st)?;
            if matches!(parsed, SongSort::Relevance) && !q_nonempty {
                return Err("sort=relevance requires a non-empty q parameter".into());
            }
        }
        Ok(self)
    }

    /// Serialize as a query string (for API clients). Pagination uses [`ListQuery::to_query_string`];
    /// adds `sort`, `lang`, and `tag` when set.
    pub fn to_query_string(&self) -> String {
        fn enc(s: &str) -> String {
            let mut out = String::with_capacity(s.len());
            for c in s.chars() {
                match c {
                    ' ' => out.push_str("%20"),
                    '&' => out.push_str("%26"),
                    '=' => out.push_str("%3D"),
                    '%' => out.push_str("%25"),
                    '+' => out.push_str("%2B"),
                    c => out.push(c),
                }
            }
            out
        }

        let mut q = self.list_query().to_query_string();
        let append = |q: &mut String, k: &str, v: &str| {
            if q.is_empty() {
                q.push('?');
            } else if !q.contains('?') {
                q.insert(0, '?');
            } else {
                q.push('&');
            }
            q.push_str(k);
            q.push('=');
            q.push_str(&enc(v));
        };

        if let Some(ref raw) = self.sort {
            if let Ok(sort) = SongSort::from_sort_param(raw) {
                append(&mut q, "sort", sort.canonical_sort_param());
            } else {
                append(&mut q, "sort", raw.as_str());
            }
        }
        if let Some(ref lang) = self.lang {
            if !lang.is_empty() {
                append(&mut q, "lang", lang);
            }
        }
        if let Some(ref tag) = self.tag {
            if !tag.is_empty() {
                append(&mut q, "tag", tag);
            }
        }
        q
    }

    /// Query string without `?`, with `page` overridden (preserves sort/lang/tag filters).
    pub fn query_string_for_page(&self, page: u32) -> String {
        let mut s = self.clone();
        s.page = Some(page);
        s.to_query_string().trim_start_matches('?').to_string()
    }

    /// Effective sort: explicit `sort`, or inferred from presence of `q`.
    pub fn effective_sort(&self) -> SongSort {
        match self.sort.as_deref() {
            Some(s) => SongSort::from_sort_param(s).expect("sort validated"),
            None => {
                let q_nonempty = self.q.as_ref().is_some_and(|q| !q.trim().is_empty());
                if q_nonempty {
                    SongSort::Relevance
                } else {
                    SongSort::IdDesc
                }
            }
        }
    }
}
