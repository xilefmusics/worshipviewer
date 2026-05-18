use serde::de::{Error as DeError, Visitor};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[cfg(feature = "backend")]
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, Default, PartialEq)]
#[cfg_attr(
    feature = "backend",
    derive(ToSchema),
    schema(rename_all = "snake_case")
)]
pub enum ScrollType {
    #[default]
    OnePage,
    HalfPage,
    TwoPage,
    Book,
    TwoHalfPage,
}

impl Serialize for ScrollType {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.to_wire())
    }
}

impl<'de> Deserialize<'de> for ScrollType {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_str(ScrollTypeVisitor)
    }
}

struct ScrollTypeVisitor;

impl Visitor<'_> for ScrollTypeVisitor {
    type Value = ScrollType;

    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("scroll type (snake_case; legacy PascalCase accepted)")
    }

    fn visit_str<E: DeError>(self, s: &str) -> Result<Self::Value, E> {
        parse_scroll_type(s).map_err(E::custom)
    }
}

fn parse_scroll_type(s: &str) -> Result<ScrollType, String> {
    const LEGACY: &[(&str, ScrollType)] = &[
        ("OnePage", ScrollType::OnePage),
        ("HalfPage", ScrollType::HalfPage),
        ("TwoPage", ScrollType::TwoPage),
        ("Book", ScrollType::Book),
        ("TwoHalfPage", ScrollType::TwoHalfPage),
    ];
    for (name, v) in LEGACY {
        if *name == s {
            super::orientation::legacy_enum_warn("ScrollType", s);
            return Ok(*v);
        }
    }
    match s {
        "one_page" => Ok(ScrollType::OnePage),
        "half_page" => Ok(ScrollType::HalfPage),
        "two_page" => Ok(ScrollType::TwoPage),
        "book" => Ok(ScrollType::Book),
        "two_half_page" => Ok(ScrollType::TwoHalfPage),
        _ => Err(format!("unknown scroll type: {s}")),
    }
}

impl ScrollType {
    pub fn next(&self) -> Self {
        match self {
            Self::OnePage => Self::HalfPage,
            Self::HalfPage => Self::TwoPage,
            Self::TwoPage => Self::Book,
            Self::Book => Self::TwoHalfPage,
            Self::TwoHalfPage => Self::OnePage,
        }
    }

    fn to_wire(self) -> &'static str {
        match self {
            Self::OnePage => "one_page",
            Self::HalfPage => "half_page",
            Self::TwoPage => "two_page",
            Self::Book => "book",
            Self::TwoHalfPage => "two_half_page",
        }
    }

    pub fn to_str(&self) -> &'static str {
        match self {
            Self::OnePage => "[1]",
            Self::HalfPage => "[1/2]",
            Self::TwoPage => "[2]",
            Self::Book => "[b]",
            Self::TwoHalfPage => "[2/2]",
        }
    }
}
