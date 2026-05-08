//! Rate-limit responses as RFC 7807 Problem JSON and audit logging for 429s.

use std::future::{Ready, ready};
use std::rc::Rc;

use actix_governor::governor::NotUntil;
use actix_governor::governor::clock::{Clock, DefaultClock, QuantaInstant};
use actix_web::dev::{Service, ServiceRequest, ServiceResponse, Transform, forward_ready};
use actix_web::http::header::ContentType;
use actix_web::{Error, HttpMessage, HttpResponse, HttpResponseBuilder};
use futures_util::future::LocalBoxFuture;
use shared::error::Problem;

use crate::auth::AuthorizationContext;

/// Problem Details body for actix-governor 429 responses (retry headers already on `response`).
pub fn rate_limit_problem_response(
    negative: &NotUntil<QuantaInstant>,
    mut response: HttpResponseBuilder,
    instance: Option<String>,
) -> HttpResponse {
    let wait_time = negative
        .wait_time_from(DefaultClock::default().now())
        .as_secs();
    let detail = format!("rate limit exceeded; retry after {wait_time}s");
    let problem = Problem::new(
        "https://worshipviewer.invalid/problems/too_many_requests".into(),
        "Too Many Requests".into(),
        429,
        "too_many_requests",
        detail,
        instance,
    );
    response.content_type(ContentType::json()).json(problem)
}

/// Logs [`crate::audit!("audit.rate_limit.rejected", ...)`] when the inner service returns 429.
#[derive(Clone, Default)]
pub struct AuditRateLimit429;

impl<S, B> Transform<S, ServiceRequest> for AuditRateLimit429
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = AuditRateLimit429Middleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuditRateLimit429Middleware {
            service: Rc::new(service),
        }))
    }
}

pub struct AuditRateLimit429Middleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for AuditRateLimit429Middleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let route = req
            .match_pattern()
            .map(|p| p.to_string())
            .unwrap_or_else(|| req.path().to_string());
        let user_id = req
            .extensions()
            .get::<AuthorizationContext>()
            .map(|ctx| ctx.user.id.clone());
        let client_ip = req
            .peer_addr()
            .map(|a| a.ip().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let svc = Rc::clone(&self.service);

        Box::pin(async move {
            let resp = svc.call(req).await?;
            if resp.status() == actix_web::http::StatusCode::TOO_MANY_REQUESTS {
                match &user_id {
                    Some(uid) => {
                        crate::audit!(
                            "audit.rate_limit.rejected",
                            route = tracing::field::display(&route),
                            client_ip = tracing::field::display(&client_ip),
                            user_id = tracing::field::display(uid)
                            ; "rate limit exceeded"
                        );
                    }
                    None => {
                        crate::audit!(
                            "audit.rate_limit.rejected",
                            route = tracing::field::display(&route),
                            client_ip = tracing::field::display(&client_ip)
                            ; "rate limit exceeded"
                        );
                    }
                }
            }
            Ok(resp)
        })
    }
}
