use super::{
    HorizontalContainerAlignment, SlideTextOrientation, TextAlignment, TextShadow, TextTransform,
};
use serde::{Deserialize, Serialize};
use stylist::Style;
use web_sys::{HtmlInputElement, HtmlSelectElement};
use yew::prelude::*;

#[derive(Properties, Serialize, Deserialize, PartialEq, Clone)]
pub struct SettingsData {
    pub max_lines_per_slide: u8,
    pub background: u8,
    pub text_orientation: SlideTextOrientation,
    pub font_size: u8,
    pub horizontal_container_alignment: HorizontalContainerAlignment,
    pub text_alignment: TextAlignment,
    pub text_shadow: TextShadow,
    pub text_transform: TextTransform,
}

impl Default for SettingsData {
    fn default() -> Self {
        Self {
            max_lines_per_slide: 2,
            background: 2,
            text_orientation: SlideTextOrientation::Center,
            font_size: 60,
            horizontal_container_alignment: HorizontalContainerAlignment::Center,
            text_alignment: TextAlignment::Center,
            text_shadow: TextShadow::None,
            text_transform: TextTransform::Uppercase,
        }
    }
}

#[derive(Properties, PartialEq)]
pub struct SettingsProps {
    pub settings: SettingsData,
    pub set_settings: Callback<SettingsData>,
}

#[function_component(Settings)]
pub fn settings(props: &SettingsProps) -> Html {
    let set_max_lines_per_slide = {
        let settings = props.settings.clone();
        let set_settings = props.set_settings.clone();

        Callback::from(move |num: u8| {
            let mut settings = settings.clone();
            settings.max_lines_per_slide = num;
            set_settings.emit(settings);
        })
    };

    let set_background = {
        let settings = props.settings.clone();
        let set_settings = props.set_settings.clone();

        Callback::from(move |num: u8| {
            let mut settings = settings.clone();
            settings.background = num;
            set_settings.emit(settings);
        })
    };

    let set_text_orientation = {
        let settings = props.settings.clone();
        let set_settings = props.set_settings.clone();

        Callback::from(move |orientation: SlideTextOrientation| {
            let mut settings = settings.clone();
            settings.text_orientation = orientation;
            set_settings.emit(settings);
        })
    };

    let set_font_size = {
        let settings = props.settings.clone();
        let set_settings = props.set_settings.clone();

        Callback::from(move |num: u8| {
            let mut settings = settings.clone();
            settings.font_size = num;
            set_settings.emit(settings);
        })
    };

    let set_horizontal_container_alignment = {
        let settings = props.settings.clone();
        let set_settings = props.set_settings.clone();

        Callback::from(move |alignment: HorizontalContainerAlignment| {
            let mut settings = settings.clone();
            settings.horizontal_container_alignment = alignment;
            set_settings.emit(settings);
        })
    };

    let set_text_alignment = {
        let settings = props.settings.clone();
        let set_settings = props.set_settings.clone();

        Callback::from(move |alignment: TextAlignment| {
            let mut settings = settings.clone();
            settings.text_alignment = alignment;
            set_settings.emit(settings);
        })
    };

    let set_text_shadow = {
        let settings = props.settings.clone();
        let set_settings = props.set_settings.clone();

        Callback::from(move |shadow: TextShadow| {
            let mut settings = settings.clone();
            settings.text_shadow = shadow;
            set_settings.emit(settings);
        })
    };

    let set_text_transform = {
        let settings = props.settings.clone();
        let set_settings = props.set_settings.clone();

        Callback::from(move |transform: TextTransform| {
            let mut settings = settings.clone();
            settings.text_transform = transform;
            set_settings.emit(settings);
        })
    };

    html! {
        <div class={Style::new(include_str!("settings.css")).expect("Unwrapping CSS should work!")}>
            <div class="settings-group">
                <div class="setting">
                    <label for="max-lines-per-slide">
                        <span class="material-symbols-outlined">{"format_line_spacing"}</span>
                        {"Lines per slide"}
                    </label>
                    <input
                        type="number"
                        id="max-lines-per-slide"
                        value={props.settings.max_lines_per_slide.to_string()}
                        oninput={Callback::from(move |e: InputEvent| {
                            let input: HtmlInputElement = e.target_unchecked_into();
                            if let Ok(value) = input.value().parse::<u8>() {
                                if (1..=10).contains(&value) {
                                    set_max_lines_per_slide.emit(value);
                                }
                            }
                        })}
                    />
                </div>
            </div>
            <div class="settings-group">
                <div class="setting">
                    <label for="font-size">
                        <span class="material-symbols-outlined">{"format_size"}</span>
                        {"Font size"}
                    </label>
                    <input type="number" id="font-size" value={props.settings.font_size.to_string()} oninput={Callback::from(move |e: InputEvent| {
                        let input: HtmlInputElement = e.target_unchecked_into();
                        if let Ok(value) = input.value().parse::<u8>() {
                            set_font_size.emit(value);
                        }
                    })}/>
                </div>
                <div class="setting">
                    <label for="text-alignment">
                        <span class="material-symbols-outlined">{"format_align_left"}</span>
                        {"Text alignment"}
                    </label>
                    <select id="text-alignment" onchange={Callback::from(move |e: Event| {
                        let select: HtmlSelectElement = e.target_unchecked_into();
                        if let Ok(value) = select.value().parse::<TextAlignment>() {
                            set_text_alignment.emit(value);
                        }
                    })}>
                        <option value="left" selected={props.settings.text_alignment.to_select_value() == "left"}>{"Left"}</option>
                        <option value="center" selected={props.settings.text_alignment.to_select_value() == "center"}>{"Center"}</option>
                        <option value="right" selected={props.settings.text_alignment.to_select_value() == "right"}>{"Right"}</option>
                    </select>
                </div>
                <div class="setting">
                    <label for="text-shadow">
                        <span class="material-symbols-outlined">{"shadow"}</span>
                        {"Text shadow"}
                    </label>
                    <select id="text-shadow" onchange={Callback::from(move |e: Event| {
                        let select: HtmlSelectElement = e.target_unchecked_into();
                        if let Ok(value) = select.value().parse::<TextShadow>() {
                            set_text_shadow.emit(value);
                        }
                    })}>
                        <option value="none" selected={props.settings.text_shadow.to_select_value() == "none"}>{"None"}</option>
                        <option value="subtle" selected={props.settings.text_shadow.to_select_value() == "subtle"}>{"Subtle"}</option>
                        <option value="medium" selected={props.settings.text_shadow.to_select_value() == "medium"}>{"Medium"}</option>
                        <option value="strong" selected={props.settings.text_shadow.to_select_value() == "strong"}>{"Strong"}</option>
                    </select>
                </div>
                <div class="setting">
                    <label for="text-transform">
                        <span class="material-symbols-outlined">{"text_fields"}</span>
                        {"Text transform"}
                    </label>
                    <select id="text-transform" onchange={Callback::from(move |e: Event| {
                        let select: HtmlSelectElement = e.target_unchecked_into();
                        if let Ok(value) = select.value().parse::<TextTransform>() {
                            set_text_transform.emit(value);
                        }
                    })}>
                        <option value="none" selected={props.settings.text_transform.to_select_value() == "none"}>{"None"}</option>
                        <option value="uppercase" selected={props.settings.text_transform.to_select_value() == "uppercase"}>{"Uppercase"}</option>
                        <option value="lowercase" selected={props.settings.text_transform.to_select_value() == "lowercase"}>{"Lowercase"}</option>
                        <option value="capitalize" selected={props.settings.text_transform.to_select_value() == "capitalize"}>{"Capitalize"}</option>
                    </select>
                </div>
            </div>
            <div class="settings-group">
                <div class="setting">
                    <label for="text-orientation">
                        <span class="material-symbols-outlined">{"vertical_align_center"}</span>
                        {"Vertical position"}
                    </label>
                    <select id="text-orientation" onchange={Callback::from(move |e: Event| {
                        let select: HtmlSelectElement = e.target_unchecked_into();
                        if let Ok(value) = select.value().parse::<SlideTextOrientation>() {
                            set_text_orientation.emit(value);
                        }
                    })}>
                        <option value="top" selected={props.settings.text_orientation.to_select_value() == "top"}>{"Top"}</option>
                        <option value="center" selected={props.settings.text_orientation.to_select_value() == "center"}>{"Center"}</option>
                        <option value="bottom" selected={props.settings.text_orientation.to_select_value() == "bottom"}>{"Bottom"}</option>
                    </select>
                </div>
                <div class="setting">
                    <label for="horizontal-container-alignment">
                        <span class="material-symbols-outlined">{"align_horizontal_center"}</span>
                        {"Horizontal position"}
                    </label>
                    <select id="horizontal-container-alignment" onchange={Callback::from(move |e: Event| {
                        let select: HtmlSelectElement = e.target_unchecked_into();
                        if let Ok(value) = select.value().parse::<HorizontalContainerAlignment>() {
                            set_horizontal_container_alignment.emit(value);
                        }
                    })}>
                        <option value="left" selected={props.settings.horizontal_container_alignment.to_select_value() == "left"}>{"Left"}</option>
                        <option value="center" selected={props.settings.horizontal_container_alignment.to_select_value() == "center"}>{"Center"}</option>
                        <option value="right" selected={props.settings.horizontal_container_alignment.to_select_value() == "right"}>{"Right"}</option>
                    </select>
                </div>
            </div>
            <div class="settings-group">
                <div class="setting">
                    <label for="background">
                        <span class="material-symbols-outlined">{"palette"}</span>
                        {"Background"}
                    </label>
                    <select id="background" onchange={Callback::from(move |e: Event| {
                        let select: HtmlSelectElement = e.target_unchecked_into();
                        if let Ok(value) = select.value().parse::<u8>() {
                            set_background.emit(value);
                        }
                    })}>
                        <option value="0" selected={props.settings.background == 0}>{"Black"}</option>
                        <option value="1" selected={props.settings.background == 1}>{"Red"}</option>
                        <option value="2" selected={props.settings.background == 2}>{"Ray"}</option>
                    </select>
                </div>
            </div>
        </div>
    }
}
