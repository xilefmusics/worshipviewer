use crate::components::presenter::{SettingsData, Slide, SlideProps, SlideSync};
use wasm_bindgen::JsCast;
use web_sys::{window, HtmlElement};
use yew::prelude::*;

#[function_component(PresenterSlidesPage)]
pub fn presenter_page() -> Html {
    let slide_props = use_state(|| SlideProps {
        text: String::new(),
        settings: SettingsData::default(),
        is_black: false,
        expand: true,
    });

    let slide_sync_ref = use_mut_ref(SlideSync::new);

    use_effect_with((), {
        let slide_sync_ref = slide_sync_ref.clone();
        let slide_props = slide_props.clone();
        move |_| {
            slide_sync_ref
                .borrow_mut()
                .setup_listener(move |props: SlideProps| {
                    slide_props.set(props);
                });
            || {}
        }
    });

    let ondblclick = Callback::from(|_: MouseEvent| {
        if let Some(window) = window() {
            if let Some(document) = window.document() {
                if let Some(document_element) = document.document_element() {
                    if let Ok(html_element) = document_element.dyn_into::<HtmlElement>() {
                        let _ = html_element.request_fullscreen();
                    }
                }
            }
        }
    });

    html! {
        <div
            style="width: 100vw; height: 100vh; overflow: hidden;"
            ondblclick={ondblclick}
        >
            <Slide
                text={slide_props.text.clone()}
                settings={slide_props.settings.clone()}
                is_black={slide_props.is_black}
                expand={slide_props.expand}
            />
        </div>
    }
}
