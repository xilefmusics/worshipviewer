use std::future::{Ready, ready};
use std::rc::Rc;

use actix_web::dev::{Service, ServiceRequest, ServiceResponse, Transform, forward_ready};
use actix_web::web::Data;
use actix_web::{Error, HttpMessage};
use futures_util::future::LocalBoxFuture;

use super::authorization_bearer;
use super::{AuthorizationContext, load_authorization_context};
use crate::database::Database;
use crate::error::AppError;
use crate::http_audit::AuditSessionId;
use crate::settings::CookieConfig;
use tracing::debug;

#[derive(Clone, Default)]
pub struct RequireUser;

impl<S, B> Transform<S, ServiceRequest> for RequireUser
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = RequireUserMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RequireUserMiddleware {
            service: Rc::new(service),
        }))
    }
}

pub struct RequireUserMiddleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for RequireUserMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let db = req
            .app_data::<Data<Database>>()
            .cloned()
            .ok_or_else(|| AppError::Internal("database handle missing".into()))
            .map_err(Error::from);

        let cookie_cfg = req
            .app_data::<Data<CookieConfig>>()
            .cloned()
            .ok_or_else(|| AppError::Internal("cookie config missing".into()))
            .map_err(Error::from);
        let service = Rc::clone(&self.service);

        Box::pin(async move {
            let db = match db {
                Ok(data) => data,
                Err(err) => return Err(err),
            };
            let cookie_cfg = match cookie_cfg {
                Ok(data) => data,
                Err(err) => return Err(err),
            };

            let session_id = match authorization_bearer(&req).or_else(|| {
                req.cookie(&cookie_cfg.name)
                    .map(|cookie| cookie.value().to_owned())
            }) {
                Some(id) => id,
                None => {
                    debug!(reason = "missing_session", "unauthorized request");
                    return Err(AppError::unauthorized().into());
                }
            };

            let ctx = match load_authorization_context(db.get_ref(), &session_id).await {
                Ok(Some(ctx)) => ctx,
                Ok(None) => {
                    debug!(reason = "unknown_session", "session not found");
                    return Err(AppError::unauthorized().into());
                }
                Err(err) => return Err(err.into()),
            };

            if ctx.session.expired {
                debug!(reason = "expired_session", "session expired");
                return Err(AppError::unauthorized().into());
            }

            tracing::Span::current().record("user_id", tracing::field::display(&ctx.user.id));
            req.extensions_mut().insert(AuditSessionId(session_id));
            req.extensions_mut().insert(ctx);

            let response = service.call(req).await?;
            Ok(response)
        })
    }
}

#[derive(Clone, Default)]
pub struct RequireAdmin;

impl<S, B> Transform<S, ServiceRequest> for RequireAdmin
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = RequireAdminMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RequireAdminMiddleware {
            service: Rc::new(service),
        }))
    }
}

pub struct RequireAdminMiddleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for RequireAdminMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Rc::clone(&self.service);

        Box::pin(async move {
            let is_admin = req
                .extensions()
                .get::<AuthorizationContext>()
                .map(|ctx| ctx.is_app_admin())
                .unwrap_or(false);

            if !is_admin {
                match req.extensions().get::<AuthorizationContext>() {
                    Some(ctx) => {
                        debug!(
                            reason = "require_admin_forbidden",
                            user_id = %ctx.user.id,
                            "forbidden: admin role required"
                        );
                    }
                    None => {
                        debug!(
                            reason = "require_admin_forbidden",
                            "forbidden: admin role required (no authorization context in extensions)"
                        );
                    }
                }
                return Err(AppError::forbidden().into());
            }

            service.call(req).await
        })
    }
}
