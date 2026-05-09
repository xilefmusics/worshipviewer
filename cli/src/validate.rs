use std::fmt;

use shared::api::{ListQuery, PageQuery};

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

pub fn list_query_from_opts(page: Option<u32>, page_size: Option<u32>) -> ListQuery {
    let mut q = ListQuery::new();
    if let Some(p) = page {
        q = q.with_page(p);
    }
    if let Some(ps) = page_size {
        q = q.with_page_size(ps);
    }
    q
}

pub fn page_query_from_opts(page: Option<u32>, page_size: Option<u32>) -> PageQuery {
    PageQuery { page, page_size }
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
