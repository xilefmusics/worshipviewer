use chrono::{DateTime, Utc};
use shared::api::ApiClient;
use shared::monitoring::MonitoringMetricsQuery;
use shared::net::DefaultHttpClient;

use crate::commands::MonitoringCommand;
use crate::output::OutputFormat;
use crate::validate::page_query_from_page_args;

pub async fn handle_monitoring(
    client: &ApiClient<DefaultHttpClient>,
    output: OutputFormat,
    dry_run: bool,
    cmd: &MonitoringCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        MonitoringCommand::AuditLogs { page } => {
            let query = page_query_from_page_args(page)?;
            if dry_run {
                crate::output::print_json(
                    &serde_json::json!({
                        "method": "GET",
                        "path": format!(
                            "api/v1/monitoring/http-audit-logs{}",
                            query.as_list_query().to_query_string()
                        ),
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let logs = client.list_http_audit_logs(query).await?;
            match crate::output::effective_output_format(&output) {
                crate::output::OutputFormat::Ndjson => crate::output::print_ndjson_list(&logs),
                _ => crate::output::print_json(&logs, &output),
            }?;
            Ok(())
        }
        MonitoringCommand::Metrics { start, end } => {
            let start: DateTime<Utc> = start
                .trim()
                .parse()
                .map_err(|e: chrono::ParseError| format!("invalid --start: {e}"))?;
            let end: DateTime<Utc> = end
                .trim()
                .parse()
                .map_err(|e: chrono::ParseError| format!("invalid --end: {e}"))?;
            let query = MonitoringMetricsQuery { start, end };
            if dry_run {
                crate::output::print_json(
                    &serde_json::json!({
                        "method": "GET",
                        "path": format!("api/v1/monitoring/metrics{}", query.to_query_string()),
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let metrics = client.get_monitoring_metrics(query).await?;
            crate::output::print_json(&metrics, &output)?;
            Ok(())
        }
    }
}
