use crate::components::SongViewer;
use shared::player::PlayerItem;
use shared::song::{ChordRepresentation, SimpleChord};
use stylist::Style;
use yew::prelude::*;

#[derive(Properties, PartialEq, Clone)]
pub struct Props {
    #[prop_or_default]
    pub item: PlayerItem,
    pub font_size: i32,
    pub override_key: Option<SimpleChord>,
    pub override_representation: Option<ChordRepresentation>,
}

#[function_component(PageComponent)]
pub fn page_components(props: &Props) -> Html {
    match &props.item {
        PlayerItem::Blob(b) => html! {
            <div class={Style::new(include_str!("page.css")).expect("Unwrapping CSS should work!")}>
                <img src={format!("/api/v1/blobs/{}/data", b.blob_id)}/>
            </div>
        },
        PlayerItem::Chords(c) => {
            html! {
                <SongViewer
                    song={c.song.clone()}
                    override_key={props.override_key.clone()}
                    override_representation={props.override_representation}
                />
            }
        }
    }
}
