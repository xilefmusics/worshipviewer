use web_sys::HtmlInputElement;
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct Props {
    pub bind_handle: UseStateHandle<String>,
    #[prop_or_default]
    pub options: Vec<String>,
    #[prop_or_default]
    pub strict: bool,
    #[prop_or_default]
    pub callback: Option<Callback<String>>,
    #[prop_or_default]
    pub placeholder: String,
}

#[function_component(StringInput)]
pub fn string_input(props: &Props) -> Html {
    let oninput = {
        let bind_handle = props.bind_handle.clone();
        let callback = props.callback.clone();
        move |e: InputEvent| {
            let input: HtmlInputElement = e.target_unchecked_into();
            bind_handle.set(input.value());
            if let Some(callback) = callback.clone() {
                callback.emit(input.value());
            }
        }
    };
    let onchange = {
        let bind_handle = props.bind_handle.clone();
        let callback = props.callback.clone();
        move |e: Event| {
            let input: HtmlInputElement = e.target_unchecked_into();
            bind_handle.set(input.value());
            if let Some(callback) = callback.clone() {
                callback.emit(input.value());
            }
        }
    };
    let value = (*props.bind_handle).clone();

    if !props.options.is_empty() {
        let mut options = props
            .options
            .iter()
            .filter(|&s| *s != value)
            .cloned()
            .collect::<Vec<String>>();

        options.push(value.clone());
        let options = options
            .iter()
            .map(|option| html! {<option value={option.clone()}>{option.clone()}</option>})
            .collect::<Html>();
        if props.strict {
            html! {
            <select onchange={onchange}>
                {options}
            </select>
                }
        } else {
            let uuid = web_sys::window()
                .map(|window| {
                    window
                        .crypto()
                        .map(|crypto| crypto.random_uuid())
                        .unwrap_or_else(|_| "crypto-not-supported".to_string())
                })
                .unwrap_or_else(|| "crypto-not-supported".to_string());
            let list_id = format!("list-{}", uuid);
            html! {
                <>
                    <input
                        list={list_id.clone()}
                        value={value}
                        oninput={oninput}
                        type="string"
                    />
                    <datalist id={list_id}>
                        {options}
                    </datalist>
                </>
            }
        }
    } else {
        html! {
            <input
                value={value}
                oninput={oninput}
                type="string"
                placeholder={props.placeholder.clone()}
            />
        }
    }
}
