pub mod rest {
    use actix_files::{Files, NamedFile};
    use actix_web::dev::{ServiceRequest, ServiceResponse, fn_service};
    use actix_web::http::header::{self, HeaderValue};
    use actix_web::{Error as ActixError, HttpResponse, ResponseError, Scope, web};
    use std::path::PathBuf;

    use crate::error::AppError;

    /// Keep in sync with `frontend/app/src/lib/player/av-output-csp.ts`.
    pub const AV_OUTPUT_CSP: &str = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; media-src 'self' blob: https:; frame-src https://www.youtube.com https://www.youtube-nocookie.com https:; connect-src 'self' https: blob: ws: wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

    fn is_av_output_path(path: &str) -> bool {
        path == "/player/output" || path.starts_with("/player/output/")
    }

    fn with_output_csp(path: &str, mut response: HttpResponse) -> HttpResponse {
        if is_av_output_path(path)
            && let Ok(value) = HeaderValue::from_str(AV_OUTPUT_CSP)
        {
            response
                .headers_mut()
                .insert(header::CONTENT_SECURITY_POLICY, value);
        }
        response
    }

    fn index_file(static_dir: &str) -> Result<NamedFile, AppError> {
        let root_path = PathBuf::from(static_dir);
        NamedFile::open(root_path.join("index.html"))
            .map_err(|err| AppError::NotFound(err.to_string()))
    }

    pub fn scope(static_dir: &str) -> Scope {
        let static_dir = static_dir.to_owned();

        let spa_fallback = {
            let dir = static_dir.clone();
            move |req: ServiceRequest| {
                let dir = dir.clone();
                async move {
                    let path = req.path().to_owned();
                    let (http_req, _) = req.into_parts();
                    if path.starts_with("/api/") || path.starts_with("/auth/") {
                        let response = AppError::NotFound("not found".into()).error_response();
                        return Ok(ServiceResponse::new(http_req, response));
                    }
                    let index = index_file(&dir).map_err(ActixError::from)?;
                    let response = with_output_csp(&path, index.into_response(&http_req));
                    Ok(ServiceResponse::new(http_req, response))
                }
            }
        };

        web::scope("").service(
            Files::new("/", static_dir)
                .index_file("index.html")
                .default_handler(fn_service(spa_fallback)),
        )
    }
}
