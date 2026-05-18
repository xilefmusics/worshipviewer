use super::PageComponent;
use shared::player::PlayerItem;
use shared::song::{ChordRepresentation, SimpleChord};
use std::f64::consts::SQRT_2;
use stylist::Style;
use yew::prelude::*;
use yew_hooks::use_size;
use yew_hooks::use_window_size;

fn get_content_dimensions(
    dimensions: (u32, u32),
    half_page_scroll: bool,
    have_two: bool,
) -> (i32, i32) {
    let (width, height) = dimensions;
    let (new_width, new_height) = if !have_two || half_page_scroll {
        (
            (height as f64 / SQRT_2) as i32,
            (width as f64 * SQRT_2) as i32 + 5,
        )
    } else {
        (
            (height as f64 * SQRT_2) as i32 + 5,
            (width as f64 / SQRT_2) as i32,
        )
    };
    (
        std::cmp::min(width as i32, new_width),
        std::cmp::min(height as i32, new_height),
    )
}

#[derive(Properties, PartialEq, Clone)]
pub struct Props {
    #[prop_or_default]
    pub item: PlayerItem,
    pub item2: Option<PlayerItem>,
    pub override_key: Option<SimpleChord>,
    pub override_representation: Option<ChordRepresentation>,
    pub half_page_scroll: bool,
    pub active: bool, // this is there for the component to redraw if it changes
}

#[function_component(PagesComponent)]
pub fn pages_component(props: &Props) -> Html {
    let _ = use_window_size(); // this is there for the component to redraw if the window is
                               // resized
    let node_ref = use_node_ref();
    let element_dimensions = use_size(node_ref.clone());
    let content_dimensions = get_content_dimensions(
        element_dimensions,
        props.half_page_scroll,
        props.item2.is_some(),
    );
    let page_width = if props.half_page_scroll || props.item2.is_none() {
        content_dimensions.0
    } else {
        content_dimensions.0 / 2
    };
    let font_size = page_width / 46;

    html! {
        <div
            ref={node_ref.clone()}
            class={Style::new(include_str!("pages.css")).expect("Unwrapping CSS should work!")}
        >
            <div
                class="page-wrapper"
                style={format!("width: {}px; height: {}px;", content_dimensions.0, content_dimensions.1)}
            >
                <div
                    class={"page first"}
                    style={format!("width: {}px", page_width)}
                >
                    <PageComponent
                        item={props.item.clone()}
                        font_size={font_size}
                        override_key={props.override_key.clone()}
                        override_representation={props.override_representation}
                    />
                </div>
                if let Some(item) = props.item2.clone() {
                    <div
                        class={if props.half_page_scroll {"page second half"} else {"page second"}}
                        style={format!("width: {}px", page_width)}
                    >
                        <PageComponent
                            item={item}
                            font_size={font_size}
                            override_key={props.override_key.clone()}
                            override_representation={props.override_representation}
                        />
                    </div>
                }
            </div>
        </div>
    }
}
