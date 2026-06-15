//! Query parameters for `GET /api/v1/monitoring/metrics`.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

/// Inclusive UTC calendar date range for daily metrics.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MonitoringMetricsQuery {
    pub start: NaiveDate,
    pub end: NaiveDate,
}

fn encode_query_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            ' ' => out.push_str("%20"),
            '&' => out.push_str("%26"),
            '=' => out.push_str("%3D"),
            '%' => out.push_str("%25"),
            '+' => out.push_str("%2B"),
            ':' => out.push_str("%3A"),
            c => out.push(c),
        }
    }
    out
}

impl MonitoringMetricsQuery {
    pub fn to_query_string(&self) -> String {
        let start = self.start.format("%Y-%m-%d").to_string();
        let end = self.end.format("%Y-%m-%d").to_string();
        format!(
            "?start={}&end={}",
            encode_query_component(&start),
            encode_query_component(&end)
        )
    }
}
