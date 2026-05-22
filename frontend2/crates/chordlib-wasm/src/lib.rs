//! WASM bindings for [`chordlib`] — parse ChordPro/WorshipPro, format source, render A4 HTML.

use chordlib::inputs::chord_pro;
use chordlib::inputs::ultimate_guitar;
use chordlib::outputs::{FormatChordPro, FormatHTML};
use chordlib::types::{ChordRepresentation, SimpleChord, Song};
use wasm_bindgen::prelude::*;

fn parse_song_json(json: &str) -> Result<Song, String> {
    serde_json::from_str(json).map_err(|e| e.to_string())
}

fn parse_key(key: Option<String>) -> Result<Option<SimpleChord>, String> {
    match key {
        None => Ok(None),
        Some(k) if k.trim().is_empty() => Ok(None),
        Some(k) => SimpleChord::try_from(k.as_str())
            .map(Some)
            .map_err(|e| e.to_string()),
    }
}

fn parse_representation(rep: Option<String>) -> Result<Option<ChordRepresentation>, String> {
    match rep {
        None => Ok(None),
        Some(r) if r.trim().is_empty() => Ok(None),
        Some(r) => match r.as_str() {
            "default" => Ok(Some(ChordRepresentation::Default)),
            "nashville" => Ok(Some(ChordRepresentation::Nashville)),
            _ => Err(format!("unknown chord representation: {r}")),
        },
    }
}

/// Parse ChordPro / WorshipPro source into song JSON (`chordlib::types::Song` wire shape).
#[wasm_bindgen(js_name = parseChordPro)]
pub fn parse_chord_pro(source: &str) -> Result<String, String> {
    let song = chord_pro::load_string(source).map_err(|e| e.to_string())?;
    serde_json::to_string(&song).map_err(|e| e.to_string())
}

/// Parse Ultimate Guitar saved page HTML into song JSON.
#[wasm_bindgen(js_name = parseUltimateGuitarHtml)]
pub fn parse_ultimate_guitar_html(html: &str) -> Result<String, String> {
    let song = ultimate_guitar::load_html(html).map_err(|e| e.to_string())?;
    serde_json::to_string(&song).map_err(|e| e.to_string())
}

/// Format structured song JSON as ChordPro or WorshipPro text.
#[wasm_bindgen(js_name = formatChordPro)]
pub fn format_chord_pro(
    song_json: &str,
    worship_pro: bool,
    key: Option<String>,
    representation: Option<String>,
    language: Option<u32>,
) -> Result<String, String> {
    let song = parse_song_json(song_json)?;
    let key_ref = parse_key(key)?;
    let rep_ref = parse_representation(representation)?;
    let lang = language.map(|l| l as usize);
    Ok((&song).format_chord_pro(
        key_ref.as_ref(),
        rep_ref.as_ref(),
        lang,
        worship_pro,
    ))
}

/// DIN-A4 HTML preview (body fragment + CSS) for a structured song.
#[wasm_bindgen]
pub struct HtmlPage {
    html: String,
    css: String,
}

#[wasm_bindgen]
impl HtmlPage {
    #[wasm_bindgen(getter)]
    pub fn html(&self) -> String {
        self.html.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn css(&self) -> String {
        self.css.clone()
    }
}

#[wasm_bindgen(js_name = renderA4Html)]
pub fn render_a4_html(
    song_json: &str,
    key: Option<String>,
    representation: Option<String>,
    language: Option<u32>,
    scale: Option<f32>,
) -> Result<HtmlPage, String> {
    let song = parse_song_json(song_json)?;
    let key_ref = parse_key(key)?;
    let rep_ref = parse_representation(representation)?;
    let lang = language.map(|l| l as usize);
    let (html, css) = (&song).format_html_page(key_ref.as_ref(), rep_ref.as_ref(), lang, scale);
    Ok(HtmlPage { html, css })
}

/// Per-section HTML fragments + shared CSS (no A4 page wrapper).
#[wasm_bindgen]
pub struct SectionHtmlPage {
    sections: Vec<String>,
    css: String,
}

#[wasm_bindgen]
impl SectionHtmlPage {
    #[wasm_bindgen(getter)]
    pub fn sections(&self) -> Vec<String> {
        self.sections.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn css(&self) -> String {
        self.css.clone()
    }
}

#[wasm_bindgen(js_name = renderA4SectionHtmls)]
pub fn render_a4_section_htmls(
    song_json: &str,
    key: Option<String>,
    representation: Option<String>,
    language: Option<u32>,
    scale: Option<f32>,
) -> Result<SectionHtmlPage, String> {
    let song = parse_song_json(song_json)?;
    let key_ref = parse_key(key)?;
    let rep_ref = parse_representation(representation)?;
    let lang = language.map(|l| l as usize);
    let (sections, css) = (&song).format_html_sections(key_ref.as_ref(), rep_ref.as_ref(), lang, scale);
    Ok(SectionHtmlPage { sections, css })
}

/// Transpose all chords in a song to the given key symbol (e.g. `G`, `Bb`).
#[wasm_bindgen(js_name = transposeSong)]
pub fn transpose_song(song_json: &str, key: &str) -> Result<String, String> {
    let mut song = parse_song_json(song_json)?;
    let target = SimpleChord::try_from(key).map_err(|e| e.to_string())?;
    song.transpose(target);
    serde_json::to_string(&song).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_and_round_trip() {
        let source = "{title: Test}\n{key: C}\n\n[C]Hello";
        let json = parse_chord_pro(source).expect("parse");
        let out = format_chord_pro(&json, false, None, None, None).expect("format");
        assert!(out.contains("title"));
        assert!(out.contains("[C]"));
    }

    #[test]
    fn render_html_non_empty() {
        let source = "{title: Test}\n{key: C}\n\n[C]Hello";
        let json = parse_chord_pro(source).expect("parse");
        let page = render_a4_html(&json, None, None, None, Some(1.0)).expect("render");
        assert!(!page.html.is_empty());
        assert!(!page.css.is_empty());
    }

    #[test]
    fn render_section_htmls_returns_fragments() {
        let source = "{title: Test}\n{key: C}\n{section: Verse}\n[C]One\n{section: Chorus}\n[D]Two";
        let json = parse_chord_pro(source).expect("parse");
        let page = render_a4_section_htmls(&json, None, None, None, Some(1.0)).expect("render");
        assert_eq!(page.sections().len(), 2);
        assert!(page.sections()[0].contains("Verse"));
        assert!(page.sections()[1].contains("Chorus"));
        assert!(!page.css().is_empty());
    }

    #[test]
    fn parse_ultimate_guitar_html_fixture() {
        let content = "Tempo: 120\n[Verse 1]\n[ch]C[/ch] Test lyrics";
        let json = serde_json::json!({
            "store": {
                "page": {
                    "data": {
                        "tab_view": {
                            "wiki_tab": {
                                "content": content
                            }
                        },
                        "tab": {
                            "song_name": "Test Song",
                            "artist_name": "Test Artist",
                            "tonality_name": "C"
                        }
                    }
                }
            }
        });
        let json_str = json.to_string().replace('"', "&quot;");
        let html = format!(
            r#"<!DOCTYPE html><html><body><div class="js-store" data-content="{}"></div></body></html>"#,
            json_str
        );
        let out = parse_ultimate_guitar_html(&html).expect("parse ug html");
        assert!(out.contains("Test Song"));
        assert!(out.contains("Verse 1"));
    }
}
