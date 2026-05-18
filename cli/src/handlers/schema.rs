use serde_json::Value;

use shared::api::ApiClient;
use shared::net::DefaultHttpClient;

use crate::output::{self, OutputFormat};

pub async fn handle_schema(
    client: &ApiClient<DefaultHttpClient>,
    output: OutputFormat,
    path_prefix: Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut schema: Value = client.get_openapi_docs().await?;

    if let Some(prefix) = path_prefix {
        if let Some(paths) = schema.get_mut("paths").and_then(|v| v.as_object_mut()) {
            paths.retain(|k, _| k.starts_with(&prefix));
        }
    }

    output::print_json(&schema, &output)
}

pub async fn handle_schema_inspect(
    client: &ApiClient<DefaultHttpClient>,
    output: OutputFormat,
    domain: &str,
    action: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let openapi: Value = client.get_openapi_docs().await?;

    let (method, path) = map_cli_command_to_openapi_operation(domain, action)?;
    let operation = get_operation(&openapi, &path, &method)?;

    let operation_id = operation
        .get("operationId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let components = openapi
        .get("components")
        .and_then(|v| v.as_object())
        .and_then(|o| o.get("schemas"))
        .and_then(|v| v.as_object());

    let request_schema = extract_request_schema(operation)
        .map(|schema| expand_refs(&schema, components, &mut std::collections::HashSet::new()));

    let response_schema = extract_success_response_schema(operation)
        .map(|schema| expand_refs(&schema, components, &mut std::collections::HashSet::new()));

    let result = serde_json::json!({
        "method": method.to_uppercase(),
        "path": path,
        "operation_id": operation_id,
        "request": request_schema,
        "response": response_schema,
    });

    output::print_json(&result, &output)
}

fn map_cli_command_to_openapi_operation(
    domain: &str,
    action: &str,
) -> Result<(String, String), Box<dyn std::error::Error>> {
    let domain = domain.to_ascii_lowercase();
    let action = action.to_ascii_lowercase();

    let mapped = match (domain.as_str(), action.as_str()) {
        ("about", "get") | ("about", "") => ("get", "/api/v1/about"),
        ("auth", "otp-request") => ("post", "/auth/otp/request"),
        ("auth", "otp-verify") => ("post", "/auth/otp/verify"),
        ("auth", "logout") => ("post", "/auth/logout"),
        ("users", "list") => ("get", "/api/v1/users"),
        ("users", "get") => ("get", "/api/v1/users/{id}"),
        ("users", "me") => ("get", "/api/v1/users/me"),
        ("users", "me-metrics") => ("get", "/api/v1/users/me/metrics"),
        ("users", "metrics") => ("get", "/api/v1/users/{id}/metrics"),
        ("users", "profile-picture-put") => ("put", "/api/v1/users/me/profile-picture"),
        ("users", "profile-picture-delete") => ("delete", "/api/v1/users/me/profile-picture"),
        ("users", "create") => ("post", "/api/v1/users"),
        ("users", "delete") => ("delete", "/api/v1/users/{id}"),
        ("sessions", "list-mine") => ("get", "/api/v1/users/me/sessions"),
        ("sessions", "get-mine") => ("get", "/api/v1/users/me/sessions/{id}"),
        ("sessions", "get-current-mine") => ("get", "/api/v1/users/me/sessions/current"),
        ("sessions", "current-session-metrics") => ("get", "/api/v1/users/me/session/metrics"),
        ("sessions", "get-mine-metrics") => ("get", "/api/v1/users/me/sessions/{id}/metrics"),
        ("sessions", "delete-mine") => ("delete", "/api/v1/users/me/sessions/{id}"),
        ("sessions", "create-for-user") => ("post", "/api/v1/users/{user_id}/sessions"),
        ("sessions", "list-for-user") => ("get", "/api/v1/users/{user_id}/sessions"),
        ("sessions", "get-for-user") => ("get", "/api/v1/users/{user_id}/sessions/{id}"),
        ("sessions", "get-for-user-metrics") => {
            ("get", "/api/v1/users/{user_id}/sessions/{id}/metrics")
        }
        ("sessions", "delete-for-user") => ("delete", "/api/v1/users/{user_id}/sessions/{id}"),
        ("teams", "list") => ("get", "/api/v1/teams"),
        ("teams", "get") => ("get", "/api/v1/teams/{id}"),
        ("teams", "create") => ("post", "/api/v1/teams"),
        ("teams", "update") => ("put", "/api/v1/teams/{id}"),
        ("teams", "patch") => ("patch", "/api/v1/teams/{id}"),
        ("teams", "delete") => ("delete", "/api/v1/teams/{id}"),
        ("team-invitations", "list") => ("get", "/api/v1/teams/{team_id}/invitations"),
        ("team-invitations", "create") => ("post", "/api/v1/teams/{team_id}/invitations"),
        ("team-invitations", "get") => {
            ("get", "/api/v1/teams/{team_id}/invitations/{invitation_id}")
        }
        ("team-invitations", "delete") => (
            "delete",
            "/api/v1/teams/{team_id}/invitations/{invitation_id}",
        ),
        ("team-invitations", "accept") => (
            "post",
            "/api/v1/teams/{team_id}/invitations/{invitation_id}/accept",
        ),
        ("team-invitations", "accept-legacy") => {
            ("post", "/api/v1/invitations/{invitation_id}/accept")
        }
        ("songs", "list") => ("get", "/api/v1/songs"),
        ("songs", "get") => ("get", "/api/v1/songs/{id}"),
        ("songs", "player") => ("get", "/api/v1/songs/{id}/player"),
        ("songs", "create") => ("post", "/api/v1/songs"),
        ("songs", "update") => ("put", "/api/v1/songs/{id}"),
        ("songs", "patch") => ("patch", "/api/v1/songs/{id}"),
        ("songs", "move") => ("post", "/api/v1/songs/{id}/move"),
        ("songs", "delete") => ("delete", "/api/v1/songs/{id}"),
        ("songs", "like-status") => ("get", "/api/v1/songs/{id}/like"),
        ("songs", "like-put") | ("songs", "update-like-status") => {
            ("put", "/api/v1/songs/{id}/like")
        }
        ("songs", "like-delete") | ("songs", "update-unlike-status") => {
            ("delete", "/api/v1/songs/{id}/like")
        }
        ("collections", "list") => ("get", "/api/v1/collections"),
        ("collections", "get") => ("get", "/api/v1/collections/{id}"),
        ("collections", "songs") => ("get", "/api/v1/collections/{id}/songs"),
        ("collections", "player") => ("get", "/api/v1/collections/{id}/player"),
        ("collections", "create") => ("post", "/api/v1/collections"),
        ("collections", "update") => ("put", "/api/v1/collections/{id}"),
        ("collections", "patch") => ("patch", "/api/v1/collections/{id}"),
        ("collections", "move") => ("post", "/api/v1/collections/{id}/move"),
        ("collections", "delete") => ("delete", "/api/v1/collections/{id}"),
        ("setlists", "list") => ("get", "/api/v1/setlists"),
        ("setlists", "get") => ("get", "/api/v1/setlists/{id}"),
        ("setlists", "songs") => ("get", "/api/v1/setlists/{id}/songs"),
        ("setlists", "player") => ("get", "/api/v1/setlists/{id}/player"),
        ("setlists", "create") => ("post", "/api/v1/setlists"),
        ("setlists", "update") => ("put", "/api/v1/setlists/{id}"),
        ("setlists", "patch") => ("patch", "/api/v1/setlists/{id}"),
        ("setlists", "move") => ("post", "/api/v1/setlists/{id}/move"),
        ("setlists", "delete") => ("delete", "/api/v1/setlists/{id}"),
        ("blobs", "list") => ("get", "/api/v1/blobs"),
        ("blobs", "get") => ("get", "/api/v1/blobs/{id}"),
        ("blobs", "create") => ("post", "/api/v1/blobs"),
        ("blobs", "update") => ("put", "/api/v1/blobs/{id}"),
        ("blobs", "patch") => ("patch", "/api/v1/blobs/{id}"),
        ("blobs", "move") => ("post", "/api/v1/blobs/{id}/move"),
        ("blobs", "delete") => ("delete", "/api/v1/blobs/{id}"),
        ("blobs", "download-url") | ("blobs", "download-data") => {
            ("get", "/api/v1/blobs/{id}/data")
        }
        ("blobs", "upload-data") => ("put", "/api/v1/blobs/{id}/data"),
        ("monitoring", "audit-logs") => ("get", "/api/v1/monitoring/http-audit-logs"),
        ("monitoring", "metrics") => ("get", "/api/v1/monitoring/metrics"),
        _ => return Err(format!("Unknown CLI command: {domain} {action}").into()),
    };

    Ok((mapped.0.to_string(), mapped.1.to_string()))
}

fn get_operation<'a>(
    openapi: &'a Value,
    path: &str,
    method: &str,
) -> Result<&'a Value, Box<dyn std::error::Error>> {
    let paths = openapi
        .get("paths")
        .and_then(|v| v.as_object())
        .ok_or("OpenAPI document missing paths")?;

    let path_item = paths
        .get(path)
        .ok_or_else(|| format!("OpenAPI document missing path {path}"))?;

    let operation = path_item
        .get(method)
        .ok_or_else(|| format!("OpenAPI document missing operation {method} {path}"))?;

    Ok(operation)
}

fn extract_request_schema(operation: &Value) -> Option<Value> {
    let request_body = operation.get("requestBody")?;
    let content = request_body.get("content")?.as_object()?;
    let schema = pick_content_schema(content)?;
    Some(schema.clone())
}

fn extract_success_response_schema(operation: &Value) -> Option<Value> {
    let responses = operation.get("responses")?.as_object()?;

    let preferred = ["200", "201", "202", "204"];
    let mut chosen: Option<&Value> = None;
    for code in preferred {
        if let Some(v) = responses.get(code) {
            chosen = Some(v);
            break;
        }
    }

    if chosen.is_none() {
        for (code, value) in responses {
            if code.starts_with('2') {
                chosen = Some(value);
                break;
            }
        }
    }

    let chosen = chosen?;
    let content = chosen.get("content")?.as_object()?;
    let schema = pick_content_schema(content)?;
    Some(schema.clone())
}

fn pick_content_schema(content: &serde_json::Map<String, Value>) -> Option<&Value> {
    if let Some(app) = content.get("application/json") {
        return app.get("schema");
    }

    for (_ct, value) in content {
        if let Some(schema) = value.get("schema") {
            return Some(schema);
        }
    }

    None
}

fn expand_refs(
    schema: &Value,
    components_schemas: Option<&serde_json::Map<String, Value>>,
    seen: &mut std::collections::HashSet<String>,
) -> Value {
    match schema {
        Value::Object(obj) => {
            if let Some(Value::String(reference)) = obj.get("$ref") {
                if let Some((prefix, name)) = reference.split_once("#/components/schemas/") {
                    let _ = prefix;
                    if let Some(components) = components_schemas {
                        if let Some(resolved) = components.get(name) {
                            if seen.insert(name.to_string()) {
                                let expanded = expand_refs(resolved, components_schemas, seen);
                                seen.remove(name);
                                return expanded;
                            }
                        }
                    }
                }

                return schema.clone();
            }

            let mut out = serde_json::Map::new();
            for (k, v) in obj {
                out.insert(k.clone(), expand_refs(v, components_schemas, seen));
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(
            arr.iter()
                .map(|v| expand_refs(v, components_schemas, seen))
                .collect(),
        ),
        other => other.clone(),
    }
}
