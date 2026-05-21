use std::time::Duration;

use reqwest::Url;
use shared::blob::FileType;

use crate::error::AppError;

/// Hosts allowed for OIDC `picture` URL fetches (Google profile CDN).
pub fn oauth_picture_url_allowed(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    host == "googleusercontent.com" || host.ends_with(".googleusercontent.com")
}

pub fn avatar_file_type_from_magic(data: &[u8]) -> Result<FileType, AppError> {
    if data.len() >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff {
        return Ok(FileType::JPEG);
    }
    if data.len() >= 8
        && data[0] == 0x89
        && data[1] == 0x50
        && data[2] == 0x4e
        && data[3] == 0x47
        && data[4] == 0x0d
        && data[5] == 0x0a
        && data[6] == 0x1a
        && data[7] == 0x0a
    {
        return Ok(FileType::PNG);
    }
    Err(AppError::invalid_request(
        "profile picture must be PNG or JPEG",
    ))
}

pub fn avatar_dimensions(data: &[u8]) -> Result<(u32, u32), AppError> {
    let sz = imagesize::blob_size(data).map_err(|_| {
        AppError::invalid_request("could not read image dimensions for profile picture")
    })?;
    let w =
        u32::try_from(sz.width).map_err(|_| AppError::invalid_request("image width too large"))?;
    let h = u32::try_from(sz.height)
        .map_err(|_| AppError::invalid_request("image height too large"))?;
    Ok((w, h))
}

pub fn file_type_from_content_type(ct: &str) -> Result<FileType, AppError> {
    let base = ct
        .trim()
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    match base.as_str() {
        "image/jpeg" | "image/jpg" => Ok(FileType::JPEG),
        "image/png" => Ok(FileType::PNG),
        _ => Err(AppError::invalid_request(
            "Content-Type must be image/jpeg or image/png",
        )),
    }
}

pub fn assert_magic_matches_content_type(data: &[u8], expected: &FileType) -> Result<(), AppError> {
    let from_bytes = avatar_file_type_from_magic(data)?;
    if &from_bytes != expected {
        return Err(AppError::invalid_request(
            "image bytes do not match Content-Type",
        ));
    }
    Ok(())
}

pub async fn fetch_oauth_picture_bytes(
    client: &reqwest::Client,
    url: &str,
    max_bytes: usize,
) -> Result<Vec<u8>, AppError> {
    let parsed = Url::parse(url).map_err(|_| AppError::invalid_request("invalid picture URL"))?;
    if !oauth_picture_url_allowed(&parsed) {
        return Err(AppError::invalid_request("picture URL host is not allowed"));
    }

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::internal_from_err("oauth.picture.fetch", e))?;

    if !resp.status().is_success() {
        return Err(AppError::invalid_request(format!(
            "picture URL returned HTTP {}",
            resp.status()
        )));
    }

    if let Some(len) = resp.content_length()
        && len > max_bytes as u64
    {
        return Err(AppError::invalid_request(
            "profile picture exceeds size limit",
        ));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::internal_from_err("oauth.picture.read_body", e))?;

    if bytes.len() > max_bytes {
        return Err(AppError::invalid_request(
            "profile picture exceeds size limit",
        ));
    }

    Ok(bytes.to_vec())
}

pub fn oauth_fetch_client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(concat!(
            env!("CARGO_PKG_NAME"),
            "/",
            env!("CARGO_PKG_VERSION")
        ))
        .build()
        .map_err(|e| AppError::internal_from_err("oauth.picture.http_client", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn googleusercontent_hosts_allowed() {
        let u = Url::parse("https://lh3.googleusercontent.com/a/abc=s96-c").unwrap();
        assert!(oauth_picture_url_allowed(&u));
        let u2 = Url::parse("https://sub.cdn.googleusercontent.com/x").unwrap();
        assert!(oauth_picture_url_allowed(&u2));
    }

    #[test]
    fn random_host_rejected() {
        let u = Url::parse("https://evil.example/pic.png").unwrap();
        assert!(!oauth_picture_url_allowed(&u));
    }

    #[test]
    fn http_scheme_rejected() {
        let u = Url::parse("http://lh3.googleusercontent.com/x").unwrap();
        assert!(!oauth_picture_url_allowed(&u));
    }

    #[test]
    fn content_type_strips_charset_suffix() {
        assert_eq!(
            file_type_from_content_type("image/jpeg; charset=binary").unwrap(),
            FileType::JPEG
        );
        assert_eq!(
            file_type_from_content_type("image/png; charset=UTF-8").unwrap(),
            FileType::PNG
        );
    }
}
