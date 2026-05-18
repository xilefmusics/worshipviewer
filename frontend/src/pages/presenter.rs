use crate::api::use_api;
use crate::components::{Presenter, PresenterQuery};
use shared::song::Song;
use yew::prelude::*;
use yew_router::prelude::*;

#[function_component(PresenterPage)]
pub fn presenter_page() -> Html {
    let query = use_location()
        .unwrap()
        .query::<PresenterQuery>()
        .unwrap_or(PresenterQuery::default());

    let songs = use_state(Vec::<Song>::new);
    let api = use_api();
    {
        let songs = songs.clone();
        let api = api.clone();
        let query = query.clone();
        use_effect_with((), move |_| {
            let songs = songs.clone();
            let api = api.clone();
            wasm_bindgen_futures::spawn_local(async move {
                if let Some(setlist) = query.setlist.as_ref() {
                    songs.set(api.get_setlist_songs(&setlist.to_owned()).await.unwrap());
                } else if let Some(collection) = query.collection.as_ref() {
                    songs.set(
                        api.get_collection_songs(&collection.to_owned())
                            .await
                            .unwrap(),
                    );
                } else if let Some(id) = query.id.as_ref() {
                    songs.set(vec![api.get_song(&id.to_owned()).await.unwrap()]);
                } else {
                    songs.set(api.get_songs().await.unwrap());
                }
            });
            || ()
        });
    }

    html! {
        <Presenter songs={(*songs).clone()} query={query} />
    }
}
