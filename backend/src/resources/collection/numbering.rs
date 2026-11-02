use shared::song::Link as SongLink;

/// Return one greater than the largest numeric collection label or row-order fallback.
pub(super) fn next_collection_song_number(links: &[SongLink]) -> String {
    let mut maximum: Option<String> = None;

    for (index, link) in links.iter().enumerate() {
        let row_number = (index + 1).to_string();
        let candidate = match link.nr.as_deref().map(str::trim) {
            None | Some("") => Some(row_number),
            Some(value) if value.bytes().all(|byte| byte.is_ascii_digit()) => {
                Some(normalize_decimal(value))
            }
            Some(_) => None,
        };

        if let Some(candidate) = candidate
            && maximum
                .as_deref()
                .is_none_or(|current| decimal_is_greater(&candidate, current))
        {
            maximum = Some(candidate);
        }
    }

    increment_decimal(maximum.as_deref().unwrap_or("0"))
}

fn normalize_decimal(value: &str) -> String {
    let normalized = value.trim_start_matches('0');
    if normalized.is_empty() {
        "0".into()
    } else {
        normalized.into()
    }
}

fn decimal_is_greater(left: &str, right: &str) -> bool {
    left.len() > right.len() || (left.len() == right.len() && left.as_bytes() > right.as_bytes())
}

fn increment_decimal(value: &str) -> String {
    let mut digits = value.as_bytes().to_vec();
    for digit in digits.iter_mut().rev() {
        if *digit == b'9' {
            *digit = b'0';
        } else {
            *digit += 1;
            return String::from_utf8(digits).expect("decimal digits are valid UTF-8");
        }
    }
    digits.insert(0, b'1');
    String::from_utf8(digits).expect("decimal digits are valid UTF-8")
}

#[cfg(test)]
mod tests {
    use shared::song::Link as SongLink;

    use super::next_collection_song_number;

    fn link(nr: Option<&str>) -> SongLink {
        SongLink {
            id: "song".into(),
            nr: nr.map(str::to_owned),
            key: None,
            tempo: None,
            language: None,
        }
    }

    #[test]
    fn uses_the_largest_numeric_label_and_row_order_fallbacks() {
        let links = vec![
            link(Some("5")),
            link(None),
            link(Some("2a")),
            link(Some("12")),
        ];
        assert_eq!(next_collection_song_number(&links), "13");
    }

    #[test]
    fn blank_numbers_use_their_current_positions() {
        let links = vec![link(None), link(Some("")), link(Some("1a"))];
        assert_eq!(next_collection_song_number(&links), "3");
    }

    #[test]
    fn ignores_non_numeric_labels_and_starts_at_one_when_none_are_numeric() {
        let links = vec![link(Some("2a")), link(Some("intro"))];
        assert_eq!(next_collection_song_number(&links), "1");
    }

    #[test]
    fn increments_large_decimal_labels_without_overflow() {
        let links = vec![link(Some("999999999999999999999999999999"))];
        assert_eq!(
            next_collection_song_number(&links),
            "1000000000000000000000000000000"
        );
    }
}
