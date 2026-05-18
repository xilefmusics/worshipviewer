use super::{
    Outline, Query, Settings, SettingsData, Sidebar, SidebarPanel, Slide, SlideProps, SlideSync,
    Slides, SongData, Toc, TocItem,
};
use crate::api::use_api;
use crate::components::{Topbar, TopbarButton, TopbarSelect, TopbarSelectOption, TopbarSpacer};
use crate::route::Route;
use shared::song::Song;
use std::collections::HashMap;
use stylist::Style;
use web_sys::window;
use yew::prelude::*;
use yew_hooks::use_event_with_window;
use yew_router::prelude::*;

#[derive(Properties, PartialEq)]
pub struct PresenterProps {
    pub songs: Vec<Song>,
    pub query: Query,
}

#[function_component(Presenter)]
pub fn presenter(props: &PresenterProps) -> Html {
    // Always start with defaults - don't load from localStorage
    // This ensures defaults are always respected on page load
    let settings = use_state(SettingsData::default);
    let song_data = use_state(|| None::<SongData>);
    let is_black = use_state(|| false);
    let current_outline_idx = use_state(|| 0);
    let current_text_idx = use_state(|| 0);
    let current_text = use_state(String::new);
    let current_song_idx = use_state(|| 0);
    let current_song = use_state(|| None::<Song>);
    let slide_sync = use_mut_ref(SlideSync::new);

    // Broadcast default settings on mount to overwrite any old localStorage values
    {
        let settings = settings.clone();
        let slide_sync = slide_sync.clone();
        use_effect_with((), move |_| {
            slide_sync.borrow().broadcast(&SlideProps {
                text: String::new(),
                settings: (*settings).clone(),
                is_black: false,
                expand: true,
            });
            || {}
        });
    }

    use_effect_with(((*current_text).clone(), (*settings).clone(), *is_black), {
        let slide_sync = slide_sync.clone();
        move |(text, settings, is_black)| {
            slide_sync.borrow().broadcast(&SlideProps {
                text: text.clone(),
                settings: settings.clone(),
                is_black: *is_black,
                expand: true,
            });
        }
    });

    use_effect_with((props.songs.clone(), (*settings).clone()), {
        let song_data = song_data.clone();
        let current_song = current_song.clone();
        move |(songs, settings)| {
            if let Some(first_song) = songs.first() {
                song_data.set(Some(SongData::new(
                    first_song,
                    settings.max_lines_per_slide,
                )));
                current_song.set(Some(songs[0].clone()));
            }
            || ()
        }
    });

    let set_current = {
        let current_text = current_text.clone();
        let current_text_idx = current_text_idx.clone();
        let current_outline_idx = current_outline_idx.clone();
        let song_data = song_data.clone();
        let is_black = is_black.clone();
        Callback::from(move |(idx, outline_idx): (usize, usize)| {
            if let Some(song_data) = song_data.as_ref() {
                is_black.set(false);
                current_text_idx.set(idx);
                current_outline_idx.set(outline_idx);
                if let Some(slide) = song_data.slides.get(idx) {
                    current_text.set(slide.clone());
                } else {
                    current_text.set(String::new());
                }
            }
        })
    };

    let set_current_song = {
        let song_data = song_data.clone();
        let current_song_idx = current_song_idx.clone();
        let songs = props.songs.clone();
        let max_lines_per_slide = settings.max_lines_per_slide;
        let current_text_idx = current_text_idx.clone();
        let current_outline_idx = current_outline_idx.clone();
        let current_song = current_song.clone();
        Callback::from(move |idx: usize| {
            if idx >= songs.len() {
                return;
            }
            current_song_idx.set(idx);
            song_data.set(Some(SongData::new(&songs[idx], max_lines_per_slide)));
            current_text_idx.set(0);
            current_outline_idx.set(0);
            current_song.set(Some(songs[idx].clone()));
        })
    };

    let set_settings = {
        let settings = settings.clone();
        let current_song_idx = current_song_idx.clone();
        let song_data = song_data.clone();
        let songs = props.songs.clone();
        Callback::from(move |new: SettingsData| {
            song_data.set(Some(SongData::new(
                &songs[*current_song_idx],
                new.max_lines_per_slide,
            )));
            settings.set(new);
        })
    };

    let navigator = use_navigator().unwrap();

    {
        let song_data = song_data.clone();
        let set_current = set_current.clone();
        let current_text = current_text.clone();
        let is_black = is_black.clone();
        let current_outline_idx = current_outline_idx.clone();
        let set_current_song = set_current_song.clone();
        let current_song_idx = current_song_idx.clone();
        let num_of_songs = props.songs.len();
        let query = props.query.clone();
        let current_song_id = current_song.as_ref().map(|song| song.id.clone());
        let navigator = navigator.clone();
        let api = use_api();
        let current_song = current_song.clone();
        use_event_with_window("keydown", move |e: KeyboardEvent| match e.key().as_str() {
            "ArrowLeft" | "ArrowUp" | "PageUp" | "Backspace" => {
                if let Some((section, offset)) = song_data
                    .as_ref()
                    .unwrap()
                    .prev_section(*current_outline_idx)
                {
                    if section.text_idx < usize::MAX {
                        set_current.emit((section.text_idx + offset, section.outline_idx + offset));
                    } else {
                        set_current.emit((section.text_idx, section.outline_idx + offset));
                    }
                }
            }
            "ArrowRight" | "ArrowDown" | "PageDown" | " " => {
                if let Some((section, offset)) = song_data
                    .as_ref()
                    .unwrap()
                    .next_section(*current_outline_idx)
                {
                    if section.text_idx < usize::MAX {
                        set_current.emit((section.text_idx + offset, section.outline_idx + offset));
                    } else {
                        set_current.emit((section.text_idx, section.outline_idx + offset));
                    }
                }
            }
            "c" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Chorus")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "v" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Verse")
                    .or_else(|| song_data.as_ref().unwrap().find_section("Verse 1"))
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "1" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Verse 1")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "2" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Verse 2")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "3" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Verse 3")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "4" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Verse 4")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "5" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Verse 5")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "6" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Verse 6")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "7" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Verse 7")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "8" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Verse 8")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "9" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Verse 9")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "p" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Pre-Chorus")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "b" => {
                if let Some(text_idx) = song_data
                    .as_ref()
                    .unwrap()
                    .find_section("Bridge")
                    .map(|section| section.text_idx)
                {
                    set_current.emit((text_idx, usize::MAX));
                }
            }
            "o" => {
                let _ = window()
                    .unwrap()
                    .open_with_url_and_target("/presenter/slides", "_blank")
                    .unwrap();
            }
            "e" => {
                if let Some(id) = current_song_id.clone() {
                    navigator
                        .push_with_query(
                            &Route::Editor,
                            &([("id", &id)].iter().cloned().collect::<HashMap<_, _>>()),
                        )
                        .unwrap();
                }
            }
            "E" => {
                if let Some(id) = query.setlist.as_ref() {
                    navigator
                        .push_with_query(
                            &Route::SetlistEditor,
                            &([("id", &id)].iter().cloned().collect::<HashMap<_, _>>()),
                        )
                        .unwrap();
                }
            }
            "Escape" => {
                navigator.push(&query.back_route());
            }
            "r" => {
                current_text.set(String::new());
                is_black.set(false);
            }
            "R" => {
                current_text.set(String::new());
                is_black.set(true);
            }
            "n" => {
                if *current_song_idx >= num_of_songs {
                    return;
                }
                set_current_song.emit(*current_song_idx + 1);
            }
            "N" => {
                if *current_song_idx == 0 {
                    return;
                }
                set_current_song.emit(*current_song_idx - 1);
            }
            "l" => {
                if let Some(song) = current_song.as_ref() {
                    let id = song.id.clone();
                    let liked = song.user_specific_addons.liked;
                    let api = api.clone();
                    wasm_bindgen_futures::spawn_local(async move {
                        api.update_song_like_status(&id, !liked).await.unwrap();
                    });
                }
            }
            _ => {}
        });
    }

    html! {
        <div class={Style::new(include_str!("presenter.css")).expect("Unwrapping CSS should work!")}>
            <Topbar>
                <TopbarButton icon="arrow_back" onclick={let navigator = navigator.clone(); let back_route = props.query.back_route(); move |_: MouseEvent| navigator.push(&back_route)} />
                <TopbarSpacer />
                <TopbarSelect>
                    <TopbarSelectOption
                        icon="news"
                        text="Player"
                        onclick={let navigator = navigator.clone(); let query = props.query.to_map(); move |_: MouseEvent| navigator.push_with_query(&Route::Player, &query).unwrap()}
                    />
                    <TopbarSelectOption
                        icon="monitor"
                        text="Presenter"
                        selected={true}
                    />
                </TopbarSelect>
                <TopbarSpacer />
                <TopbarButton icon="slideshow" onclick={move |_: MouseEvent| {let _ = window().unwrap().open_with_url_and_target("/presenter/slides", "_blank").unwrap();}} />
                {if let Some(id) = props.query.setlist.as_ref() {
                    let navigator = navigator.clone();
                    let id = id.clone();
                    html! {
                        <TopbarButton
                            icon="contract_edit"
                            onclick={move |_: MouseEvent| navigator.push_with_query(&Route::SetlistEditor, &([("id", &id)].iter().cloned().collect::<HashMap<_, _>>())).unwrap()}
                        />
                    }
                } else {
                    html! {}
                }}
                {if let Some(song) = current_song.as_ref() {
                    let navigator = navigator.clone();
                    let id = song.id.to_owned();
                    html! {
                        <TopbarButton
                            icon="edit"
                            onclick={move |_: MouseEvent| navigator.push_with_query(&Route::Editor, &[("id", &id)].iter().cloned().collect::<HashMap<_, _>>()).unwrap()}
                        />
                    }
                } else {
                    html! {}
                }}
            </Topbar>
            <div class="main">
                <Sidebar>
                    <SidebarPanel icon="pin">
                        <Toc
                            list={props
                                .songs
                                .iter()
                                .enumerate()
                                .map(|(idx, song)| TocItem { idx, text: format!("{}. {}", idx + 1, song.data.title()) })
                                .collect::<Vec<TocItem>>()
                            }
                            select={set_current_song.clone()}
                            current_idx={*current_song_idx}
                        />
                    </SidebarPanel>
                    <SidebarPanel icon="sort_by_alpha">
                        <Toc
                            list={
                                let mut items = props
                                    .songs
                                    .iter()
                                    .enumerate()
                                    .map(|(idx, song)| TocItem { idx, text: song.data.title().to_string() })
                                    .collect::<Vec<TocItem>>();
                                items.sort_by_key(|item| item.text.clone());
                                items
                            }
                            select={set_current_song.clone()}
                            current_idx={*current_song_idx}
                        />
                    </SidebarPanel>
                    <SidebarPanel icon="favorite">
                    <Toc
                        list={
                            let mut items = props
                                .songs
                                .iter()
                                .enumerate()
                                .filter(|(_, song)| song.user_specific_addons.liked)
                                .map(|(idx, song)| TocItem { idx, text: song.data.title().to_string() })
                                .collect::<Vec<TocItem>>();
                            items.sort_by_key(|item| item.text.clone());
                            items
                        }
                        select={set_current_song.clone()}
                        current_idx={*current_song_idx}
                    />
                    </SidebarPanel>
                </Sidebar>
                {if song_data.is_some() {
                    html! {
                        <Slides
                            data={song_data.as_ref().unwrap().clone()}
                            set_current={set_current.clone()}
                            settings={(*settings).clone()}
                        />
                    }
                } else {
                    html! {
                        <div class="empty-slides"></div>
                    }
                }}
                <div class="right">
                    <Slide
                        text={(*current_text).clone()}
                        settings={(*settings).clone()}
                        is_black={*is_black}
                    />
                    <div style="height: 16px;"></div>
                    <Sidebar>
                        <SidebarPanel icon="format_list_bulleted">
                        {if song_data.is_some() {
                            html! {
                                <Outline
                                    data={song_data.as_ref().unwrap().outline.clone()}
                                    set_current={set_current.clone()}
                                    current_text={*current_text_idx}
                                    current_outline={*current_outline_idx}
                                />
                            }
                        } else {
                            html! {
                                <div class="empty-outline"></div>
                            }
                        }}
                        </SidebarPanel>
                        <SidebarPanel icon="settings">
                            <Settings
                                settings={(*settings).clone()}
                                set_settings={set_settings.clone()}
                            />
                        </SidebarPanel>
                    </Sidebar>
                </div>
            </div>
        </div>
    }
}
