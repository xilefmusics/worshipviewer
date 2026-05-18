use shared::song::Song;
use std::collections::{HashMap, HashSet};

#[derive(Clone, PartialEq)]
pub struct OutlineData {
    pub title: String,
    pub text_idx: usize,
    pub outline_idx: usize,
    pub len: usize,
    pub duplicate: bool,
    pub has_text: bool,
}

#[derive(Clone, PartialEq)]
pub struct SongData {
    pub slides: Vec<String>,
    pub outline: Vec<OutlineData>,
}

impl SongData {
    fn slides(
        song: &Song,
        max_lines_per_slide: u8,
    ) -> (Vec<String>, HashMap<String, (usize, usize)>) {
        let mut slides: Vec<String> = Vec::new();
        let mut map: HashMap<String, (usize, usize)> = HashMap::new();

        let mut slide_idx_counter = 0;
        for section in song.data.sections.iter() {
            let current_idx = slide_idx_counter;
            let mut slide_len_counter = 0;
            let mut slide = String::new();

            for line in section.lines.iter() {
                if slide.lines().count() >= max_lines_per_slide as usize {
                    slides.push(slide);
                    slide_len_counter += 1;
                    slide_idx_counter += 1;
                    slide = String::new();
                }

                if !slide.is_empty() {
                    slide += "\n";
                }

                slide += &line
                    .parts
                    .iter()
                    .map(|part| {
                        if part.comment {
                            String::new()
                        } else {
                            part.languages[0].clone()
                        }
                    })
                    .collect::<Vec<String>>()
                    .join("");
            }

            if !slide.is_empty() {
                slides.push(slide);
                slide_len_counter += 1;
                slide_idx_counter += 1;
            }
            if slide_len_counter > 0 && !map.contains_key(&section.title) {
                map.insert(section.title.clone(), (current_idx, slide_len_counter));
            }
        }
        (slides, map)
    }

    fn outline(song: &Song, map: HashMap<String, (usize, usize)>) -> Vec<OutlineData> {
        let mut seen = HashSet::<String>::new();
        let mut outline = Vec::new();
        let mut outline_idx = 0;
        for section in song.data.sections.iter() {
            let len = map
                .get(&section.title.clone())
                .unwrap_or(&(usize::MAX, 1))
                .1
                .to_owned();
            let text_idx = map
                .get(&section.title.clone())
                .unwrap_or(&(usize::MAX, 1))
                .0
                .to_owned();

            outline.push(OutlineData {
                title: section.title.clone(),
                text_idx,
                outline_idx,
                len,
                duplicate: seen.contains(&section.title.clone()),
                has_text: text_idx != usize::MAX,
            });
            seen.insert(section.title.clone());
            outline_idx += len;
        }
        outline
    }

    pub fn new(song: &Song, max_lines_per_slide: u8) -> Self {
        let (slides, map) = Self::slides(song, max_lines_per_slide);
        let outline = Self::outline(song, map);
        Self { slides, outline }
    }

    pub fn find_section(&self, title: &str) -> Option<&OutlineData> {
        self.outline.iter().find(|outline| outline.title == title)
    }

    pub fn next_section(&self, outline_idx: usize) -> Option<(&OutlineData, usize)> {
        let current = self
            .outline
            .iter()
            .rev()
            .find(|outline| outline.outline_idx <= outline_idx)?;
        let current_offset = outline_idx - current.outline_idx;
        if current_offset < current.len - 1 {
            return Some((current, current_offset + 1));
        }

        self.outline
            .iter()
            .find(|outline| outline.outline_idx > outline_idx)
            .map(|outline| (outline, 0))
    }

    pub fn prev_section(&self, outline_idx: usize) -> Option<(&OutlineData, usize)> {
        let current = self
            .outline
            .iter()
            .rev()
            .find(|outline| outline.outline_idx <= outline_idx)?;
        let current_offset = outline_idx - current.outline_idx;
        if current_offset > 0 {
            return Some((current, current_offset - 1));
        }

        self.outline
            .iter()
            .rev()
            .find(|outline| outline.outline_idx < outline_idx)
            .map(|outline| (outline, outline.len - 1))
    }
}
