use serde::{Deserialize, Serialize};

/// Default page size when `page_size` is not supplied.
pub const PAGE_SIZE_DEFAULT: u32 = 50;
/// Hard cap on `page_size`; requests above this are rejected with 400.
pub const PAGE_SIZE_MAX: u32 = 500;

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ListQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub q: Option<String>,
    pub team: Option<String>,
}

impl ListQuery {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_page(mut self, page: u32) -> Self {
        self.page = Some(page);
        self
    }

    pub fn with_page_size(mut self, page_size: u32) -> Self {
        self.page_size = Some(page_size);
        self
    }

    pub fn with_q(mut self, q: impl Into<String>) -> Self {
        self.q = Some(q.into());
        self
    }

    pub fn with_team(mut self, team: impl Into<String>) -> Self {
        self.team = Some(team.into());
        self
    }

    /// Validate the query parameters and return `Err` with a human-readable
    /// message when they are out of range.
    ///
    /// - `page_size = 0` is rejected (non-standard and a DoS footgun).
    /// - `page_size > PAGE_SIZE_MAX` is rejected.
    pub fn validate(self) -> Result<Self, String> {
        if let Some(ps) = self.page_size {
            if ps == 0 {
                return Err("page_size must be greater than 0".into());
            }
            if ps > PAGE_SIZE_MAX {
                return Err(format!("page_size must not exceed {PAGE_SIZE_MAX}"));
            }
        }
        if let Some(ref team) = self.team {
            if team.trim().is_empty() {
                return Err("team must not be empty".into());
            }
            if team.contains(':') {
                return Err("invalid team id".into());
            }
        }
        Ok(self)
    }

    /// Return `(offset, limit)`, applying [`PAGE_SIZE_DEFAULT`] and page 0
    /// when either parameter is absent.  Always returns a finite pair;
    /// callers should run [`validate`] first to ensure the stored values are
    /// in range.
    pub fn effective_offset_limit(&self) -> (u32, u32) {
        let page = self.page.unwrap_or(0);
        let page_size = match self.page_size {
            Some(0) | None => PAGE_SIZE_DEFAULT,
            Some(ps) => ps,
        };
        (page.saturating_mul(page_size), page_size)
    }

    pub fn to_offset_limit(&self) -> Option<(u32, u32)> {
        match (self.page, self.page_size) {
            (Some(page), Some(page_size)) if page_size > 0 => {
                let offset = page.saturating_mul(page_size);
                Some((offset, page_size))
            }
            _ => None,
        }
    }

    /// Slice `items` to the page described by `query` (call after [`validate`]).
    /// Returns the page and the total number of items before paging.
    pub fn paginate_vec<T>(items: Vec<T>, query: &Self) -> (Vec<T>, u64) {
        let total = items.len() as u64;
        let (offset, limit) = query.effective_offset_limit();
        let page: Vec<T> = items
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .collect();
        (page, total)
    }

    /// For nested collection routes: when both `page` and `page_size` are absent, returns all
    /// items (backward compatible). When either is set, applies [`paginate_vec`] after
    /// [`validate`].
    pub fn paginate_nested_vec<T>(items: Vec<T>, query: &Self) -> (Vec<T>, u64) {
        let total = items.len() as u64;
        if query.page.is_none() && query.page_size.is_none() {
            return (items, total);
        }
        Self::paginate_vec(items, query)
    }

    pub fn to_query_string(&self) -> String {
        let mut parts = Vec::new();
        if let Some(page) = self.page {
            parts.push(format!("page={}", page));
        }
        if let Some(page_size) = self.page_size {
            parts.push(format!("page_size={}", page_size));
        }
        if let Some(ref q) = self.q {
            parts.push(format!("q={}", encode_query_value(q)));
        }
        if let Some(ref team) = self.team {
            parts.push(format!("team={}", encode_query_value(team)));
        }
        if parts.is_empty() {
            String::new()
        } else {
            format!("?{}", parts.join("&"))
        }
    }

    /// Query string without `?`, with `page` overridden (keeps `page_size`, `q`, `team`).
    pub fn query_string_for_page(&self, page: u32) -> String {
        let mut q = self.clone();
        q.page = Some(page);
        q.to_query_string().trim_start_matches('?').to_string()
    }
}

fn encode_query_value(s: &str) -> String {
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

/// Pagination-only query (`page`, `page_size`). Used for list routes that do not support `q`.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "backend", derive(utoipa::ToSchema))]
pub struct PageQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

impl PageQuery {
    /// Same validation rules as [`ListQuery::validate`] (without `q`).
    pub fn validate(self) -> Result<Self, String> {
        ListQuery {
            page: self.page,
            page_size: self.page_size,
            q: None,
            team: None,
        }
        .validate()
        .map(|lq| Self {
            page: lq.page,
            page_size: lq.page_size,
        })
    }

    pub fn as_list_query(&self) -> ListQuery {
        ListQuery {
            page: self.page,
            page_size: self.page_size,
            q: None,
            team: None,
        }
    }

    /// Query string without `?`, with `page` overridden.
    pub fn query_string_for_page(&self, page: u32) -> String {
        let mut q = self.as_list_query();
        q.page = Some(page);
        q.to_query_string().trim_start_matches('?').to_string()
    }
}
