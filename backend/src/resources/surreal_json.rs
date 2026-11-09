use serde::Serialize;
use serde::de::DeserializeOwned;
use surrealdb::types::{Kind, SurrealValue, Value, kind};

/// Serde-backed object wrapper for application types stored as native SurrealDB objects.
#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(transparent)]
pub(crate) struct JsonObject<T>(pub T);

impl<T> SurrealValue for JsonObject<T>
where
    T: Serialize + DeserializeOwned,
{
    fn kind_of() -> Kind {
        kind!(object)
    }

    fn is_value(value: &Value) -> bool {
        matches!(value, Value::Object(_))
    }

    fn into_value(self) -> Value {
        serde_json::to_value(self.0)
            .unwrap_or(serde_json::Value::Null)
            .into_value()
    }

    fn from_value(value: Value) -> surrealdb::Result<Self> {
        let json = serde_json::Value::from_value(value)?;
        serde_json::from_value(json)
            .map(JsonObject)
            .map_err(|error| surrealdb::Error::internal(error.to_string()))
    }
}
