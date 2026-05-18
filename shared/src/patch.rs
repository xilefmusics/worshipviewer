use serde::{Deserialize, Deserializer};

/// Three-state wrapper for PATCH request fields: distinguishes between a key being
/// absent from the request body (`Missing`), explicitly set to `null` (`Null`), or
/// carrying a concrete value (`Value(T)`).
///
/// Use with `#[serde(default)]` on the field so that a missing JSON key deserializes
/// to `Patch::Missing`, `null` becomes `Patch::Null`, and any other value becomes
/// `Patch::Value(v)`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum Patch<T> {
    #[default]
    Missing,
    Null,
    Value(T),
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Patch<T> {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Option::<T>::deserialize(d).map(|opt| match opt {
            Some(v) => Patch::Value(v),
            None => Patch::Null,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use serde_json::json;

    #[derive(Deserialize)]
    struct Wrapper {
        #[serde(default)]
        field: Patch<String>,
    }

    #[test]
    fn missing_when_key_absent() {
        let v: Wrapper = serde_json::from_value(json!({})).unwrap();
        assert!(matches!(v.field, Patch::Missing));
    }

    #[test]
    fn null_when_key_is_null() {
        let v: Wrapper = serde_json::from_value(json!({"field": null})).unwrap();
        assert!(matches!(v.field, Patch::Null));
    }

    #[test]
    fn value_when_key_has_value() {
        let v: Wrapper = serde_json::from_value(json!({"field": "hello"})).unwrap();
        assert!(matches!(v.field, Patch::Value(ref s) if s == "hello"));
    }

    #[test]
    fn vec_value_deserialized() {
        #[derive(Deserialize)]
        struct W {
            #[serde(default)]
            items: Patch<Vec<u32>>,
        }
        let v: W = serde_json::from_value(json!({"items": [1, 2, 3]})).unwrap();
        assert!(matches!(v.items, Patch::Value(ref xs) if xs == &[1u32, 2, 3]));
    }
}
