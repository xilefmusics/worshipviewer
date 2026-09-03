use std::future::{Ready, ready};
use std::rc::Rc;

use actix_web::body::MessageBody;
use actix_web::dev::{Service, ServiceRequest, ServiceResponse, Transform, forward_ready};
use actix_web::http::header::HeaderName;
use actix_web::{Error, HttpMessage};
use futures_util::future::LocalBoxFuture;
use tracing::Span;
use tracing_actix_web::RootSpanBuilder;
use uuid::Uuid;

static X_REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

/// Request path and query (`/api/v1/...?a=1`), stored for diagnostics (e.g. Problem Details `instance`).
#[derive(Clone)]
pub struct ApiRequestTarget(pub String);

/// Start time for request latency (stored in request extensions; read in [`WorshipRootSpan::on_request_end`]).
#[derive(Clone, Copy)]
pub struct RequestStartedAt(pub std::time::Instant);

/// If `traceparent` is a valid W3C trace context value (`version-trace_id-span_id-flags`),
/// returns the 16-hex-character **span id** segment (often aligned with OpenTelemetry span id).
fn span_id_from_traceparent(traceparent: &str) -> Option<String> {
    let mut parts = traceparent.split('-');
    let version = parts.next()?;
    if version != "00" {
        return None;
    }
    let _trace_id = parts.next()?;
    let span_id = parts.next()?;
    let _flags = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    if span_id.len() != 16 || !span_id.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some(span_id.to_ascii_lowercase())
}

fn request_id_string(req: &ServiceRequest) -> String {
    req.headers()
        .get("traceparent")
        .and_then(|v| v.to_str().ok())
        .and_then(span_id_from_traceparent)
        .unwrap_or_else(|| Uuid::new_v4().to_string())
}

/// Root span for [`tracing_actix_web::TracingLogger`]: correlates logs with `traceparent` / `X-Request-Id`
/// and records `status` / `latency_ms` on completion.
pub struct WorshipRootSpan;

impl RootSpanBuilder for WorshipRootSpan {
    fn on_request_start(request: &ServiceRequest) -> Span {
        let id = request_id_string(request);
        request.extensions_mut().insert(id.clone());
        let target = request
            .uri()
            .path_and_query()
            .map(|pq| pq.to_string())
            .unwrap_or_else(|| request.uri().path().to_string());
        request.extensions_mut().insert(ApiRequestTarget(target));
        request
            .extensions_mut()
            .insert(RequestStartedAt(std::time::Instant::now()));

        let route = request
            .match_pattern()
            .unwrap_or_else(|| request.path().to_string());

        tracing::info_span!(
            "http.request",
            request_id = %id,
            method = %request.method(),
            route = %route,
            user_id = tracing::field::Empty,
            actor_user_id = tracing::field::Empty,
            impersonation_id = tracing::field::Empty,
            status = tracing::field::Empty,
            latency_ms = tracing::field::Empty,
        )
    }

    fn on_request_end<B: MessageBody>(span: Span, outcome: &Result<ServiceResponse<B>, Error>) {
        match outcome {
            Ok(response) => {
                let status = response.response().status().as_u16();
                span.record("status", status);
                let latency_ms = response
                    .request()
                    .extensions()
                    .get::<RequestStartedAt>()
                    .map(|t| t.0.elapsed().as_millis() as u64)
                    .unwrap_or(0);
                span.record("latency_ms", latency_ms);
            }
            Err(err) => {
                let status = err.as_response_error().status_code().as_u16();
                span.record("status", status);
            }
        }
    }
}

/// Sets `X-Request-Id` on the response. Correlation id and [`ApiRequestTarget`] are populated by
/// [`WorshipRootSpan`] inside [`tracing_actix_web::TracingLogger`]; this middleware must run inside that logger.
#[derive(Clone, Default)]
pub struct RequestId;

impl<S, B> Transform<S, ServiceRequest> for RequestId
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = RequestIdMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RequestIdMiddleware {
            service: Rc::new(service),
        }))
    }
}

pub struct RequestIdMiddleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for RequestIdMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let id =
            req.extensions().get::<String>().cloned().expect(
                "correlation id missing: register TracingLogger::<WorshipRootSpan> outermost",
            );
        let service = Rc::clone(&self.service);
        Box::pin(async move {
            let mut resp = service.call(req).await?;
            resp.headers_mut().insert(
                X_REQUEST_ID.clone(),
                id.parse().expect("request id is a valid HeaderValue"),
            );
            Ok(resp)
        })
    }
}
