//! WASM bindings for [`chordlib`] song-format parsing, formatting, and A4 HTML rendering.

use chordlib::inputs::chord_pro;
use chordlib::inputs::propresenter;
use chordlib::inputs::songbeamer;
use chordlib::inputs::ultimate_guitar;
use chordlib::outputs::{FormatChordPro, FormatHTML, FormatProPresenter, FormatSongBeamer};
use chordlib::types::{ChordRepresentation, SimpleChord, Song, SongFlowItem};
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

/// Parse a SongBeamer `.sng` document, preserving its original byte encoding rules.
#[wasm_bindgen(js_name = parseSongBeamer)]
pub fn parse_songbeamer(bytes: &[u8]) -> Result<String, String> {
    let song = songbeamer::load_bytes(bytes).map_err(|e| e.to_string())?;
    serde_json::to_string(&song).map_err(|e| e.to_string())
}

/// Parse a modern protobuf-based ProPresenter `.pro` presentation.
#[wasm_bindgen(js_name = parseProPresenter)]
pub fn parse_propresenter(bytes: &[u8]) -> Result<String, String> {
    let song = propresenter::load_bytes(bytes).map_err(|e| e.to_string())?;
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
    Ok((&song).format_chord_pro(key_ref.as_ref(), rep_ref.as_ref(), lang, worship_pro))
}

/// Format structured song JSON as deterministic SongBeamer `.sng` bytes.
#[wasm_bindgen(js_name = formatSongBeamer)]
pub fn format_songbeamer(
    song_json: &str,
    key: Option<String>,
    representation: Option<String>,
) -> Result<Vec<u8>, String> {
    let song = parse_song_json(song_json)?;
    let key_ref = parse_key(key)?;
    let rep_ref = parse_representation(representation)?;
    (&song)
        .format_songbeamer(key_ref.as_ref(), rep_ref.as_ref())
        .map_err(|e| e.to_string())
}

/// Format structured song JSON as modern protobuf-based ProPresenter `.pro` bytes.
#[wasm_bindgen(js_name = formatProPresenter)]
pub fn format_propresenter(
    song_json: &str,
    key: Option<String>,
    representation: Option<String>,
    language: Option<u32>,
) -> Result<Vec<u8>, String> {
    let song = parse_song_json(song_json)?;
    let key_ref = parse_key(key)?;
    let rep_ref = parse_representation(representation)?;
    (&song)
        .format_propresenter(
            key_ref.as_ref(),
            rep_ref.as_ref(),
            language.map(|value| value as usize),
        )
        .map_err(|e| e.to_string())
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
    let (html, css) = (&song)
        .format_html_page(key_ref.as_ref(), rep_ref.as_ref(), lang, scale)
        .map_err(|e| e.to_string())?;
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
    let (sections, css) = (&song)
        .format_html_sections(key_ref.as_ref(), rep_ref.as_ref(), lang, scale)
        .map_err(|e| e.to_string())?;
    Ok(SectionHtmlPage { sections, css })
}

/// Transpose all chords in a song to the given key symbol (e.g. `G`, `Bb`).
#[wasm_bindgen(js_name = transposeSong)]
pub fn transpose_song(song_json: &str, key: &str) -> Result<String, String> {
    let mut song = parse_song_json(song_json)?;
    let target = SimpleChord::try_from(key).map_err(|e| e.to_string())?;
    song.apply_key(target);
    serde_json::to_string(&song).map_err(|e| e.to_string())
}

/// Copy lyric bodies from earlier sections into empty reference sections.
#[wasm_bindgen(js_name = fillSectionReferences)]
pub fn fill_section_references(song_json: &str) -> Result<String, String> {
    let mut song = parse_song_json(song_json)?;
    song.fill_section_references();
    serde_json::to_string(&song).map_err(|e| e.to_string())
}

/// Distinct section items in first-seen order (`Song::flow_items`).
#[wasm_bindgen(js_name = songFlowItems)]
pub fn song_flow_items(song_json: &str) -> Result<String, String> {
    let song = parse_song_json(song_json)?;
    serde_json::to_string(&song.flow_items()).map_err(|e| e.to_string())
}

/// Default section flow including repeats (`Song::custom_flow`).
#[wasm_bindgen(js_name = songCustomFlow)]
pub fn song_custom_flow(song_json: &str) -> Result<String, String> {
    let song = parse_song_json(song_json)?;
    serde_json::to_string(&song.custom_flow()).map_err(|e| e.to_string())
}

/// Reorder and repeat sections to match a custom flow (`Song::apply_flow`).
#[wasm_bindgen(js_name = applySongFlow)]
pub fn apply_song_flow(song_json: &str, flow_json: &str) -> Result<String, String> {
    let mut song = parse_song_json(song_json)?;
    let flow: Vec<SongFlowItem> = serde_json::from_str(flow_json).map_err(|e| e.to_string())?;
    song.apply_flow(flow).map_err(|e| e.to_string())?;
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
    fn songbeamer_bytes_round_trip() {
        let source = "{title: Test}\n{key: C}\n{section: Verse}\n[C]Hello";
        let json = parse_chord_pro(source).expect("parse");
        let bytes = format_songbeamer(&json, None, None).expect("format SongBeamer");
        assert!(bytes.starts_with(&[0xef, 0xbb, 0xbf]));

        let parsed = parse_songbeamer(&bytes).expect("parse SongBeamer");
        let song: Song = serde_json::from_str(&parsed).expect("json");
        assert_eq!(song.title(), "Test");
        assert_eq!(song.sections.len(), 1);
    }

    #[test]
    fn propresenter_bytes_round_trip() {
        let source = "{title: Test}\n{key: C}\n{section: Verse}\n[C]Hello";
        let json = parse_chord_pro(source).expect("parse");
        let bytes = format_propresenter(&json, None, None, None).expect("format ProPresenter");
        assert!(!bytes.is_empty());

        let parsed = parse_propresenter(&bytes).expect("parse ProPresenter");
        let song: Song = serde_json::from_str(&parsed).expect("json");
        assert_eq!(song.title(), "Test");
        assert_eq!(song.sections.len(), 1);
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
    fn song_flow_items_and_custom_flow_match_section_order() {
        let source = "{title: Test}\n{key: C}\n{section: Verse}\nLine one\n{section: Chorus}\nLine two\n{section: Verse}\nLine one\n";
        let json = parse_chord_pro(source).expect("parse");

        let items: Vec<SongFlowItem> =
            serde_json::from_str(&song_flow_items(&json).expect("flow items")).expect("json");
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].title, "Verse");
        assert_eq!(items[1].title, "Chorus");

        let flow: Vec<SongFlowItem> =
            serde_json::from_str(&song_custom_flow(&json).expect("custom flow")).expect("json");
        assert_eq!(flow.len(), 3);
        assert_eq!(flow[0].title, "Verse");
        assert_eq!(flow[1].title, "Chorus");
        assert_eq!(flow[2].title, "Verse");
    }

    #[test]
    fn apply_song_flow_reorders_sections() {
        let source =
            "{title: Test}\n{key: C}\n{section: Verse}\nFirst\n{section: Chorus}\nSecond\n";
        let json = parse_chord_pro(source).expect("parse");
        let flow = serde_json::to_string(&[
            SongFlowItem {
                title: "Chorus".into(),
                occurrence_index: 0,
                repeats: 1,
            },
            SongFlowItem {
                title: "Verse".into(),
                occurrence_index: 0,
                repeats: 2,
            },
        ])
        .expect("flow json");

        let applied = apply_song_flow(&json, &flow).expect("apply flow");
        let song: Song = serde_json::from_str(&applied).expect("json");
        assert_eq!(song.sections.len(), 2);
        assert_eq!(song.sections[0].title, "Chorus");
        assert_eq!(song.sections[1].title, "Verse");
        assert_eq!(song.sections[1].repeat_count, 2);
    }

    #[test]
    fn fill_section_references_copies_empty_repeat_sections() {
        let source = "{title: Test}\n{key: C}\n{section: Chorus}\nLine one\n{section: Verse}\nVerse text\n{section: Chorus}\n";
        let json = parse_chord_pro(source).expect("parse");
        let filled = fill_section_references(&json).expect("fill");
        let song: Song = serde_json::from_str(&filled).expect("json");
        assert_eq!(song.sections.len(), 3);
        assert!(!song.sections[0].lines.is_empty());
        assert!(!song.sections[1].lines.is_empty());
        assert_eq!(song.sections[2].lines, song.sections[0].lines);
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
