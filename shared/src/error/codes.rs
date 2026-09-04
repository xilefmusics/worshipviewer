//! Stable machine-readable `code` values for [`super::Problem`] responses.

/// Documented stable error codes returned in Problem `code` (must stay in sync with backend error mapping).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    Unauthorized,
    Forbidden,
    NotFound,
    InvalidRequest,
    MediaInvalidUrl,
    MediaUnsupportedUrl,
    /// Invalid `page` / `page_size` query parameters (e.g. out-of-range `page_size`).
    InvalidPageSize,
    Conflict,
    TooManyRequests,
    NotAcceptable,
    /// `If-Match` precondition failed (optimistic concurrency).
    PreconditionFailed,
    Internal,
}

impl ErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            ErrorCode::Unauthorized => "unauthorized",
            ErrorCode::Forbidden => "forbidden",
            ErrorCode::NotFound => "not_found",
            ErrorCode::InvalidRequest => "invalid_request",
            ErrorCode::MediaInvalidUrl => "media_invalid_url",
            ErrorCode::MediaUnsupportedUrl => "media_unsupported_url",
            ErrorCode::InvalidPageSize => "invalid_page_size",
            ErrorCode::Conflict => "conflict",
            ErrorCode::TooManyRequests => "too_many_requests",
            ErrorCode::NotAcceptable => "not_acceptable",
            ErrorCode::PreconditionFailed => "precondition_failed",
            ErrorCode::Internal => "internal",
        }
    }

    /// Every code documented in the public API contract (for tests and OpenAPI intro).
    pub const DOCUMENTED: &'static [&'static str] = &[
        "unauthorized",
        "forbidden",
        "not_found",
        "invalid_request",
        "media_invalid_url",
        "media_unsupported_url",
        "invalid_page_size",
        "conflict",
        "too_many_requests",
        "not_acceptable",
        "precondition_failed",
        "internal",
    ];
}

#[cfg(test)]
mod tests {
    use super::ErrorCode;
    use std::collections::HashSet;

    #[test]
    fn documented_codes_are_unique() {
        let mut seen = HashSet::new();
        for &s in ErrorCode::DOCUMENTED {
            assert!(seen.insert(s), "duplicate code in DOCUMENTED: {s}");
        }
    }

    #[test]
    fn every_variant_is_documented() {
        use ErrorCode::*;
        let documented: HashSet<_> = ErrorCode::DOCUMENTED.iter().copied().collect();
        for v in [
            Unauthorized,
            Forbidden,
            NotFound,
            InvalidRequest,
            MediaInvalidUrl,
            MediaUnsupportedUrl,
            InvalidPageSize,
            Conflict,
            TooManyRequests,
            NotAcceptable,
            PreconditionFailed,
            Internal,
        ] {
            assert!(
                documented.contains(v.as_str()),
                "variant {:?} missing from DOCUMENTED",
                v
            );
        }
    }

    #[test]
    fn documented_matches_as_str() {
        for &s in ErrorCode::DOCUMENTED {
            assert!(
                [
                    ErrorCode::Unauthorized,
                    ErrorCode::Forbidden,
                    ErrorCode::NotFound,
                    ErrorCode::InvalidRequest,
                    ErrorCode::MediaInvalidUrl,
                    ErrorCode::MediaUnsupportedUrl,
                    ErrorCode::InvalidPageSize,
                    ErrorCode::Conflict,
                    ErrorCode::TooManyRequests,
                    ErrorCode::NotAcceptable,
                    ErrorCode::PreconditionFailed,
                    ErrorCode::Internal,
                ]
                .into_iter()
                .any(|v| v.as_str() == s),
                "DOCUMENTED contains unknown code: {s}"
            );
        }
    }
}
