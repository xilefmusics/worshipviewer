use super::{Orientation, PlayerItem, ScrollType, TocItem};
use crate::song::LinkOwned as SongLinkOwned;

use serde::{Deserialize, Serialize};
use std::ops::Add;
use std::sync::OnceLock;
#[cfg(feature = "backend")]
use utoipa::ToSchema;

fn empty_item() -> &'static PlayerItem {
    static EMPTY_ITEM: OnceLock<PlayerItem> = OnceLock::new();
    EMPTY_ITEM.get_or_init(PlayerItem::default)
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct Player {
    items: Vec<PlayerItem>,
    toc: Vec<TocItem>,
    scroll_type: ScrollType,
    /// Scroll mode cached when toggling orientation (book/half-page behavior).
    scroll_type_cache_other_orientation: ScrollType,
    orientation: Orientation,
    /// In book scroll mode, whether navigation jumps between whole items.
    between_items: bool,
    index: usize,
}

impl Player {
    pub fn new(items: Vec<PlayerItem>, toc: Vec<TocItem>) -> Self {
        Self {
            items,
            toc,
            scroll_type: ScrollType::default(),
            scroll_type_cache_other_orientation: ScrollType::Book,
            orientation: Orientation::Portrait,
            between_items: bool::default(),
            index: usize::default(),
        }
    }

    pub fn toc(&self) -> &[TocItem] {
        &self.toc
    }

    pub fn song_id(&self) -> Option<String> {
        self.toc
            .iter()
            .rfind(|item| item.idx <= self.index())
            .and_then(|item| item.id.clone())
    }

    pub fn set_like_mut(&mut self, id: &str, liked: bool) {
        if let Some(idx) = self
            .toc
            .iter()
            .position(|item| item.id.as_ref() == Some(&id.to_string()))
        {
            self.toc[idx].liked = liked;
        }
    }

    pub fn is_liked(&self, id: &str) -> bool {
        self.toc
            .iter()
            .find(|item| item.id.as_ref() == Some(&id.to_string()))
            .map(|item| item.liked)
            .unwrap_or(false)
    }

    pub fn set_like(&self, id: &str, liked: bool) -> Self {
        let mut new = self.clone();
        new.set_like_mut(id, liked);
        new
    }

    pub fn like_multi(&self, ids: &[String]) -> Self {
        let mut new = self.clone();
        for id in ids {
            new.set_like_mut(id, true);
        }
        new
    }

    pub fn set_scroll_type(&self, scroll_type: ScrollType) -> Self {
        let mut new = self.clone();

        new.scroll_type = scroll_type;
        new.between_items = false;

        if let ScrollType::Book = new.scroll_type {
            if new.index().is_multiple_of(2) {
                new.decrement();
            }
        }
        new
    }

    pub fn next_scroll_type(&self) -> Self {
        self.set_scroll_type(self.scroll_type.next())
    }
    pub fn scroll_type(&self) -> &ScrollType {
        &self.scroll_type
    }
    pub fn scroll_type_str(&self) -> &str {
        self.scroll_type.to_str()
    }
    pub fn is_half_page_scroll(&self) -> bool {
        self.scroll_type == ScrollType::HalfPage
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn orientation(&self) -> Orientation {
        self.orientation
    }

    pub fn item(&self) -> (&PlayerItem, Option<&PlayerItem>) {
        if self.items.is_empty() {
            return (empty_item(), None);
        }
        let current = match self.scroll_type {
            ScrollType::OnePage | ScrollType::HalfPage | ScrollType::TwoPage | ScrollType::Book => {
                &self.items[self.index]
            }
            ScrollType::TwoHalfPage => {
                if self.index.is_multiple_of(2) && self.index != 0 && self.index < self.max_index()
                {
                    &self.items[self.index + 1]
                } else {
                    &self.items[self.index]
                }
            }
        };
        let next = match self.scroll_type {
            ScrollType::OnePage | ScrollType::HalfPage => {
                if self.between_items && self.index < self.max_index() {
                    Some(&self.items[self.index + 1])
                } else {
                    None
                }
            }
            ScrollType::TwoPage => {
                if self.index < self.max_index() {
                    Some(&self.items[self.index + 1])
                } else {
                    None
                }
            }
            ScrollType::Book => {
                if self.index < self.max_index() && self.index != 0 {
                    Some(&self.items[self.index + 1])
                } else {
                    None
                }
            }
            ScrollType::TwoHalfPage => {
                if self.index % 2 == 1 && self.index < self.max_index() {
                    Some(&self.items[self.index + 1])
                } else if self.index != 0 && self.index != self.max_index() {
                    Some(&self.items[self.index])
                } else {
                    None
                }
            }
        };
        (current, next)
    }

    pub fn index(&self) -> usize {
        self.index
    }
    pub fn max_index(&self) -> usize {
        self.items.len().saturating_sub(1)
    }

    fn increment(&mut self) {
        if self.index < self.max_index() {
            self.index += 1;
        }
    }
    fn decrement(&mut self) {
        if self.index > 0 {
            self.index -= 1;
        }
    }
    fn toggle_between_items(&mut self) {
        self.between_items = !self.between_items;
    }

    pub fn next(&self) -> Self {
        let mut new = self.clone();
        match new.scroll_type {
            ScrollType::OnePage => new.increment(),
            ScrollType::HalfPage => {
                if new.between_items {
                    new.increment();
                }
                new.toggle_between_items();
            }
            ScrollType::TwoPage => {
                new.increment();
                new.increment();
            }
            ScrollType::Book => {
                new.increment();
                if self.index > 0 {
                    new.increment();
                }
            }
            ScrollType::TwoHalfPage => new.increment(),
        }
        new
    }
    pub fn prev(&self) -> Self {
        let mut new = self.clone();
        match new.scroll_type {
            ScrollType::OnePage => new.decrement(),
            ScrollType::HalfPage => {
                if self.index > 0 {
                    new.toggle_between_items();
                    if new.between_items {
                        new.decrement();
                    }
                } else {
                    new.between_items = false;
                }
            }
            ScrollType::TwoPage | ScrollType::Book => {
                new.decrement();
                new.decrement();
            }
            ScrollType::TwoHalfPage => new.decrement(),
        }
        new
    }
    pub fn jump(&self, mut index: usize) -> Self {
        let mut new = self.clone();
        if index > new.max_index() {
            index = new.max_index();
        }
        new.index = index;
        if new.scroll_type == ScrollType::Book && new.index.is_multiple_of(2) {
            new.decrement();
        }
        new
    }

    pub fn update_orientation(&self, orientation: Orientation) -> Self {
        if self.orientation == orientation {
            return self.clone();
        }

        let mut new = self.clone();

        let new_scroll_type = new.scroll_type_cache_other_orientation;
        new.scroll_type_cache_other_orientation = new.scroll_type;
        new = new.set_scroll_type(new_scroll_type);
        new.orientation = orientation;

        new
    }
}

impl Add for Player {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        if self.items.is_empty() {
            return other;
        }
        let self_len = self.items.len();
        let last_self_item = self.items.last().expect("non-empty").clone();
        Self {
            toc: self
                .toc
                .into_iter()
                .chain(other.toc.iter().map(|item| TocItem {
                    idx: if !other.items.is_empty() && self.items.last() == other.items.first() {
                        item.idx + self_len.saturating_sub(1)
                    } else {
                        item.idx + self_len
                    },
                    title: item.title.clone(),
                    id: item.id.clone(),
                    nr: item.nr.clone(),
                    liked: item.liked,
                }))
                .collect::<Vec<TocItem>>(),
            items: self
                .items
                .into_iter()
                .chain(
                    other
                        .items
                        .into_iter()
                        .skip_while(|item| *item == last_self_item),
                )
                .collect(),
            scroll_type: self.scroll_type,
            scroll_type_cache_other_orientation: self.scroll_type_cache_other_orientation,
            orientation: self.orientation,
            between_items: self.between_items,
            index: self.index,
        }
    }
}

impl From<SongLinkOwned> for Player {
    fn from(link: SongLinkOwned) -> Self {
        Self {
            items: {
                let mut items = link
                    .song
                    .blobs
                    .iter()
                    .map(|blob| {
                        PlayerItem::Blob(super::PlayerBlobItem {
                            blob_id: blob.id.clone(),
                        })
                    })
                    .collect::<Vec<PlayerItem>>();
                if !link.song.data.sections.is_empty() || items.is_empty() {
                    let mut song = link.song.clone();
                    if let Some(key) = link.key {
                        song.data.transpose(key);
                    }
                    items.push(PlayerItem::Chords(Box::new(super::PlayerChordsItem {
                        song,
                    })))
                }
                items
            },
            toc: if link.song.not_a_song {
                vec![]
            } else {
                vec![TocItem {
                    idx: 0,
                    title: link.song.data.title().to_string(),
                    id: Some(link.song.id.clone()),
                    nr: link.nr.clone().unwrap_or_default(),
                    liked: link.liked,
                }]
            },
            scroll_type: ScrollType::default(),
            scroll_type_cache_other_orientation: ScrollType::Book,
            orientation: Orientation::Portrait,
            between_items: bool::default(),
            index: usize::default(),
        }
    }
}
