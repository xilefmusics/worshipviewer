use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize)]
struct Transition<'a> {
    state: &'a str,
    suffix: &'a str,
    new_state: &'a str,
    label: Option<&'a str>,
    back: usize,
}

pub struct SyntaxParserBuilder<'a> {
    transitions: Vec<Transition<'a>>,
    label_styles: HashMap<&'a str, String>,
}

impl<'a> SyntaxParserBuilder<'a> {
    pub fn new() -> Self {
        Self {
            transitions: Vec::new(),
            label_styles: HashMap::new(),
        }
    }

    pub fn transition(
        mut self,
        state: &'a str,
        suffix: &'a str,
        new_state: &'a str,
        label: Option<&'a str>,
        back: usize,
    ) -> Self {
        self.transitions.push(Transition {
            state,
            suffix,
            new_state,
            label,
            back,
        });
        self
    }

    pub fn label_style(mut self, label: &'a str, key: &'a str, value: &'a str) -> Self {
        self.label_styles
            .entry(label)
            .and_modify(|existing_value| {
                existing_value.push_str(key);
                existing_value.push(':');
                existing_value.push_str(value);
                existing_value.push(';');
            })
            .or_insert_with(|| {
                let mut new_value = String::new();
                new_value.push_str(key);
                new_value.push(':');
                new_value.push_str(value);
                new_value.push(';');
                new_value
            });
        self
    }

    pub fn build(&self) -> Result<SyntaxParser, serde_json::Error> {
        Ok(SyntaxParser {
            transitions: serde_json::to_string(&self.transitions)?,
            style: self
                .label_styles
                .iter()
                .map(|(key, value)| format!(".cm-{}{{{}}}", key, value))
                .collect::<String>(),
        })
    }
}

#[derive(Default, Clone, PartialEq)]
pub struct SyntaxParser {
    transitions: String,
    style: String,
}

impl<'a> SyntaxParser {
    pub fn builder() -> SyntaxParserBuilder<'a> {
        SyntaxParserBuilder::new()
    }

    pub fn transactions(&self) -> &str {
        &self.transitions
    }

    pub fn style(&self) -> &str {
        &self.style
    }
}
