use crate::api::use_api;
use crate::route::Route;
use shared::setlist::Setlist;
use std::collections::HashMap;
use stylist::Style;
use yew::prelude::*;
use yew_router::prelude::*;

#[function_component(SetlistsPage)]
pub fn setlists_page() -> Html {
    let setlists = use_state(Vec::<Setlist>::new);
    let api = use_api();

    {
        let setlists = setlists.clone();
        let api = api.clone();
        use_effect_with((), move |_| {
            let setlists = setlists.clone();
            let api = api.clone();
            wasm_bindgen_futures::spawn_local(async move {
                let mut fetched_setlists = api.get_setlists().await.unwrap();
                fetched_setlists.sort_by_key(|setlist| setlist.title.clone());
                setlists.set(fetched_setlists);
            });
            || ()
        });
    }

    let navigator = use_navigator().unwrap();

    let setlist_cards = setlists
        .iter()
        .rev()
        .map(|setlist| {
            let title = setlist.title.clone();
            let song_count = setlist.songs.len();
            let song_label = format!("{} song{}", song_count, if song_count == 1 { "" } else { "s" });
            let navigator = navigator.clone();
            let id = setlist.id.clone();
            let onclick = Callback::from(move |_: MouseEvent| {
                navigator
                    .push_with_query(
                        &Route::Player,
                        &([("setlist", &id)]
                            .iter()
                            .cloned()
                            .collect::<HashMap<_, _>>()),
                    )
                    .unwrap()
            });

            html! {
                <button
                    type="button"
                    class="setlist-card"
                    onclick={onclick}
                >
                    <div class="setlist-card__content">
                        <span class="setlist-card__title">{title}</span>
                        <span class="setlist-card__meta">{song_label}</span>
                    </div>
                    <span class="material-symbols-outlined setlist-card__chevron">{"chevron_right"}</span>
                </button>
            }
        })
        .collect::<Html>();

    let new_button = {
        let navigator = navigator.clone();
        Callback::from(move |_: MouseEvent| navigator.push(&Route::SetlistEditor))
    };

    let stylesheet = Style::new(include_str!("setlists.css")).expect("Unwrapping CSS should work!");
    let has_setlists = !setlists.is_empty();

    html! {
        <div class={classes!(stylesheet, "setlists-page")}>
            <div class="setlists-toolbar">
                <button
                    type="button"
                    class="setlists-toolbar__cta"
                    onclick={new_button}
                >
                    <span class="material-symbols-outlined">{"add"}</span>
                    <span>{"New setlist"}</span>
                </button>
            </div>
            <div class="setlists">
                {
                    if has_setlists {
                        setlist_cards
                    } else {
                        html! {
                            <div class="setlists-empty">
                                <span class="material-symbols-outlined setlists-empty__icon">{"playlist_add"}</span>
                                <p>{"No setlists yet."}</p>
                                <p>{"Create your first one to get started."}</p>
                            </div>
                        }
                    }
                }
            </div>
        </div>
    }
}
