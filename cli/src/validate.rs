use std::fmt;

use shared::api::{ListQuery, PageQuery, SongListQuery};

use crate::commands::{HubListArgs, PageArgs, SongListArgs};

#[derive(Debug)]
pub struct ValidationError {
    message: String,
}

impl ValidationError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ValidationError {}

pub fn validate_resource_id(id: &str) -> Result<&str, ValidationError> {
    if id.is_empty() {
        return Err(ValidationError::new("id must not be empty"));
    }

    if id
        .chars()
        .any(|c| c.is_control() || c == '?' || c == '#' || c == '%' || c == ':')
    {
        return Err(ValidationError::new(
            "id contains forbidden characters (control, '?', '#', '%', ':')",
        ));
    }

    Ok(id)
}

pub fn list_query_from_page_args(page: &PageArgs) -> Result<ListQuery, ValidationError> {
    let mut q = ListQuery::new();
    if let Some(p) = page.page {
        q = q.with_page(p);
    }
    if let Some(ps) = page.page_size {
        q = q.with_page_size(ps);
    }
    q.validate().map_err(ValidationError::new)
}

pub fn list_query_from_hub_args(args: &HubListArgs) -> Result<ListQuery, ValidationError> {
    let mut q = list_query_from_page_args(&args.page)?;
    if let Some(ref search) = args.filter.q {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            q = q.with_q(trimmed);
        }
    }
    if let Some(ref team) = args.filter.team {
        validate_resource_id(team)?;
        q = q.with_team(team.clone());
    }
    q.validate().map_err(ValidationError::new)
}

pub fn song_list_query_from_args(args: &SongListArgs) -> Result<SongListQuery, ValidationError> {
    let hub = HubListArgs {
        page: args.page.clone(),
        filter: args.filter.clone(),
    };
    let list = list_query_from_hub_args(&hub)?;
    let mut query = SongListQuery {
        page: list.page,
        page_size: list.page_size,
        q: list.q,
        team: list.team,
        sort: args.sort.clone(),
        lang: args.lang.clone(),
        tag: args.tag.clone(),
    };
    if let Some(ref lang) = query.lang {
        if lang.trim().is_empty() {
            query.lang = None;
        }
    }
    if let Some(ref tag) = query.tag {
        if tag.trim().is_empty() {
            query.tag = None;
        }
    }
    query.validate().map_err(ValidationError::new)
}

pub fn page_query_from_page_args(page: &PageArgs) -> Result<PageQuery, ValidationError> {
    list_query_from_page_args(page).map(|lq| PageQuery {
        page: lq.page,
        page_size: lq.page_size,
    })
}

fn guess_content_type(path: &std::path::Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "svg" => Some("image/svg+xml"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

/// Image content-type from optional override or file extension.
pub fn image_content_type_for_path(
    path: &std::path::Path,
    override_ct: Option<&str>,
) -> Result<String, ValidationError> {
    if let Some(ct) = override_ct {
        let t = ct.trim();
        if t.is_empty() {
            return Err(ValidationError::new("content-type must not be empty"));
        }
        return Ok(t.to_string());
    }
    guess_content_type(path).map(str::to_string).ok_or_else(|| {
        ValidationError::new("could not infer content-type; pass --content-type (e.g. image/png)")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{HubFilterArgs, HubListArgs, PageArgs, SongListArgs};

    #[test]
    fn hub_list_query_includes_search_and_team() {
        let args = HubListArgs {
            page: PageArgs {
                page: Some(1),
                page_size: Some(25),
                with_meta: false,
            },
            filter: HubFilterArgs {
                q: Some("grace".into()),
                team: Some("team_abc".into()),
            },
        };
        let q = list_query_from_hub_args(&args).expect("valid");
        assert_eq!(q.page, Some(1));
        assert_eq!(q.page_size, Some(25));
        assert_eq!(q.q.as_deref(), Some("grace"));
        assert_eq!(q.team.as_deref(), Some("team_abc"));
        assert!(q.to_query_string().contains("q=grace"));
    }

    #[test]
    fn song_list_query_rejects_relevance_without_q() {
        let args = SongListArgs {
            page: PageArgs::default(),
            filter: HubFilterArgs::default(),
            sort: Some("relevance".into()),
            lang: None,
            tag: None,
        };
        let err = song_list_query_from_args(&args).unwrap_err();
        assert!(err.to_string().contains("relevance"));
    }

    #[test]
    fn song_list_query_includes_lang_and_tag() {
        let args = SongListArgs {
            page: PageArgs::default(),
            filter: HubFilterArgs::default(),
            sort: Some("-id".into()),
            lang: Some("de".into()),
            tag: Some("worship".into()),
        };
        let q = song_list_query_from_args(&args).expect("valid");
        let qs = q.to_query_string();
        assert!(qs.contains("lang=de"));
        assert!(qs.contains("tag=worship"));
        assert!(qs.contains("sort=-id"));
    }

    #[test]
    fn validate_resource_id_rejects_colon() {
        assert!(validate_resource_id("bad:id").is_err());
    }
}
