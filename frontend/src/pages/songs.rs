use crate::api::use_api;
use crate::route::Route;
use shared::song::{ChordRepresentation, SimpleChord, Song};
use std::collections::HashMap;
use stylist::Style;
use yew::prelude::*;
use yew_router::prelude::*;

#[function_component(SongsPage)]
pub fn songs_page() -> Html {
    let songs = use_state(Vec::<Song>::new);
    let api = use_api();

    {
        let songs = songs.clone();
        let api = api.clone();
        use_effect_with((), move |_| {
            let songs = songs.clone();
            let api = api.clone();
            wasm_bindgen_futures::spawn_local(async move {
                let mut fetched_songs = api.get_songs().await.unwrap();
                fetched_songs.sort_by_key(|song| song.data.title().to_string());
                let fetched_songs: Vec<Song> = fetched_songs
                    .into_iter()
                    .filter(|song| !song.not_a_song)
                    .collect();
                songs.set(fetched_songs);
            });
            || ()
        });
    }

    let navigator = use_navigator().unwrap();

    let song_cards = songs
        .iter()
        .map(|song| {
            let title = song.data.title().to_string();
            let key = song
                .data
                .key
                .as_ref()
                .map(|key| key.format(&SimpleChord::default(), &ChordRepresentation::Default))
                .unwrap_or_default();
            let has_key = !key.is_empty();
            let key_label = if has_key {
                format!("Key {}", key)
            } else {
                "Key not set".to_string()
            };
            let key_classes = if has_key {
                classes!("song-card__meta")
            } else {
                classes!("song-card__meta", "song-card__meta--empty")
            };
            let navigator = navigator.clone();
            let id = song.id.clone();
            let onclick = Callback::from(move |_: MouseEvent| {
                navigator
                    .push_with_query(
                        &Route::Player,
                        &([("id", &id)].iter().cloned().collect::<HashMap<_, _>>()),
                    )
                    .unwrap()
            });

            html! {
                <button
                    type="button"
                    class="song-card"
                    onclick={onclick}
                >
                    <div class="song-card__content">
                        <span class="song-card__title">{title}</span>
                        <span class={key_classes}>{key_label}</span>
                    </div>
                    <span class="material-symbols-outlined song-card__chevron">{"chevron_right"}</span>
                </button>
            }
        })
        .collect::<Html>();

    let new_button = {
        let navigator = navigator.clone();
        Callback::from(move |_: MouseEvent| navigator.push(&Route::Editor))
    };

    let stylesheet = Style::new(include_str!("songs.css")).expect("Unwrapping CSS should work!");
    let has_songs = !songs.is_empty();

    html! {
        <div class={classes!(stylesheet, "songs-page")}>
            <div class="songs-toolbar">
                <button
                    type="button"
                    class="songs-toolbar__cta"
                    onclick={new_button}
                >
                    <span class="material-symbols-outlined">{"add"}</span>
                    <span>{"New song"}</span>
                </button>
            </div>
            <div class="songs">
                {
                    if has_songs {
                        song_cards
                    } else {
                        html! {
                            <div class="songs-empty">
                                <span class="material-symbols-outlined songs-empty__icon">{"library_music"}</span>
                                <p>{"No songs found."}</p>
                                <p>{"Add your first song to start building setlists."}</p>
                            </div>
                        }
                    }
                }
            </div>
        </div>
    }
}
