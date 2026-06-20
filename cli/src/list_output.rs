use serde::de::DeserializeOwned;
use serde::Serialize;

use shared::error::NetworkClientError;

use crate::list_fetch::{fetch_json_list, ListPagination};
use crate::output::{self, OutputFormat};
use crate::session::CliSession;
use crate::validate::ValidationError;

#[derive(Serialize)]
struct ListEnvelope<'a, T: Serialize> {
    items: &'a [T],
    pagination: ListPaginationView,
}

#[derive(Serialize)]
struct ListPaginationView {
    #[serde(skip_serializing_if = "Option::is_none")]
    total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    link: Option<String>,
}

impl From<ListPagination> for ListPaginationView {
    fn from(p: ListPagination) -> Self {
        Self {
            total: p.total,
            link: p.link,
        }
    }
}

pub async fn print_list<T, F, Fut>(
    session: &CliSession,
    api_path: &str,
    query_string: &str,
    with_meta: bool,
    output: &OutputFormat,
    fetch_plain: F,
) -> Result<(), Box<dyn std::error::Error>>
where
    T: Serialize + DeserializeOwned,
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<Vec<T>, NetworkClientError>>,
{
    if with_meta
        && matches!(
            output::effective_output_format(output),
            OutputFormat::Ndjson
        )
    {
        return Err(Box::new(ValidationError::new(
            "--with-meta cannot be used with --output ndjson; use json or pretty",
        )));
    }

    if with_meta {
        let path = format!("{api_path}{query_string}");
        let (items, pagination) = fetch_json_list::<T>(session.config(), &path).await?;
        let envelope = ListEnvelope {
            items: &items,
            pagination: pagination.into(),
        };
        output::print_json(&envelope, output)?;
        return Ok(());
    }

    let items = fetch_plain().await?;
    match output::effective_output_format(output) {
        OutputFormat::Ndjson => output::print_ndjson_list(&items),
        _ => output::print_json(&items, output),
    }
}
