use super::{CodeMirrorWrapper, SyntaxParser};
use stylist::Style;
use wasm_bindgen::prelude::*;
use web_sys::{Document, HtmlElement, HtmlScriptElement, Window};
use yew::prelude::*;

#[derive(Properties, PartialEq, Clone)]
pub struct Props {
    #[prop_or_default]
    pub content: String,
    #[prop_or_default]
    pub onsave: Option<Callback<String>>,
    #[prop_or_default]
    pub ondiscard: Option<Callback<String>>,
    #[prop_or_default]
    pub ondelete: Option<Callback<String>>,
    #[prop_or_default]
    pub onautoformat: Option<Callback<String, String>>,
    #[prop_or_default]
    pub style: String,
    #[prop_or_default]
    pub syntax_parser: SyntaxParser,
}

pub enum Msg {
    Save,
    Discard,
    Delete,
    Autoformat,
}

fn onsave_from_ctx(ctx: &Context<Editor>) -> Option<Closure<dyn Fn(String)>> {
    ctx.props().onsave.clone().map(|onsave| {
        Closure::wrap(Box::new(move |content: String| {
            onsave.emit(content);
        }) as Box<dyn Fn(String)>)
    })
}

fn onautoformat_from_ctx(ctx: &Context<Editor>) -> Option<Closure<dyn Fn(String) -> String>> {
    ctx.props().onautoformat.clone().map(|onautoformat| {
        Closure::wrap(Box::new(move |content: String| onautoformat.emit(content))
            as Box<dyn Fn(String) -> String>)
    })
}

fn code_mirror_style_class_from_ctx(ctx: &Context<Editor>) -> String {
    Style::new(format!(
        "{} {} {} {}",
        include_str!("code_mirror_before.css"),
        include_str!("external_dependencies/codemirror_5.65.5_codemirror.css"),
        include_str!("code_mirror_after.css"),
        ctx.props().syntax_parser.style(),
    ))
    .expect("Unwrapping CSS should work!")
    .get_class_name()
    .to_string()
}

pub struct Editor {
    pub editor_name: String,
    pub code_mirror_wrapper: Option<CodeMirrorWrapper>,
    pub onsave: Option<Closure<dyn Fn(String)>>,
    pub onautoformat: Option<Closure<dyn Fn(String) -> String>>,
    pub code_mirror_style_class: String,
}

impl Component for Editor {
    type Message = Msg;
    type Properties = Props;

    fn create(ctx: &Context<Self>) -> Self {
        let onsave = onsave_from_ctx(ctx);
        let onautoformat = onautoformat_from_ctx(ctx);
        let code_mirror_style_class = code_mirror_style_class_from_ctx(ctx);

        let uuid = web_sys::window()
            .map(|window| {
                window
                    .crypto()
                    .map(|crypto| crypto.random_uuid())
                    .unwrap_or_else(|_| "crypto-not-supported".to_string())
            })
            .unwrap_or_else(|| "crypto-not-supported".to_string());

        Self {
            editor_name: format!("editor-{}", uuid),
            code_mirror_wrapper: None,
            onsave,
            onautoformat,
            code_mirror_style_class,
        }
    }

    fn rendered(&mut self, ctx: &Context<Self>, first_render: bool) {
        if first_render {
            let window: Window = web_sys::window().expect("should have a window in this context");
            let document: Document = window.document().expect("should have a document on window");

            if document
                .query_selector("script[data-id='codemirror-script']")
                .unwrap()
                .is_none()
            {
                let script = document
                    .create_element("script")
                    .expect("should be able to create script element");
                script
                    .set_attribute("data-id", "codemirror-script")
                    .expect("should be able to set data-id attribute");
                script.set_inner_html(include_str!(
                    "external_dependencies/codemirror_5.65.5_codemirror.min.js"
                ));
                let script: HtmlScriptElement = script.dyn_into::<HtmlScriptElement>().unwrap();

                let body: HtmlElement = document.body().expect("document should have a body");
                body.append_child(&script)
                    .expect("should be able to append script to body");
            }

            self.code_mirror_wrapper = Some(
                CodeMirrorWrapper::new()
                    .define_mode("generated", ctx.props().syntax_parser.transactions())
                    .draw(
                        &self.editor_name,
                        self.onsave.as_ref(),
                        self.onautoformat.as_ref(),
                    )
                    .set_content(&ctx.props().content),
            );
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            Msg::Save => {
                if let Some(onsave) = &ctx.props().onsave {
                    if let Some(code_mirror_wrapper) = &self.code_mirror_wrapper {
                        onsave.emit(code_mirror_wrapper.get_content())
                    }
                };
            }
            Msg::Discard => {
                if let Some(ondiscard) = &ctx.props().ondiscard {
                    if let Some(code_mirror_wrapper) = &self.code_mirror_wrapper {
                        ondiscard.emit(code_mirror_wrapper.get_content())
                    }
                };
            }
            Msg::Delete => {
                if let Some(ondelete) = &ctx.props().ondelete {
                    if let Some(code_mirror_wrapper) = &self.code_mirror_wrapper {
                        ondelete.emit(code_mirror_wrapper.get_content())
                    }
                };
            }
            Msg::Autoformat => {
                if let Some(onautoformat) = &ctx.props().onautoformat {
                    if let Some(code_mirror_wrapper) = &self.code_mirror_wrapper {
                        code_mirror_wrapper
                            .set_content(&onautoformat.emit(code_mirror_wrapper.get_content()));
                    }
                }
            }
        };
        false
    }

    fn changed(&mut self, ctx: &Context<Self>, _old_props: &Self::Properties) -> bool {
        self.onsave = onsave_from_ctx(ctx);
        self.onautoformat = onautoformat_from_ctx(ctx);
        self.code_mirror_style_class = code_mirror_style_class_from_ctx(ctx);

        if let Some(wrapper) = self.code_mirror_wrapper.as_mut() {
            wrapper.set_onsave(self.onsave.as_ref());
            wrapper.set_onautoformat(self.onautoformat.as_ref());
            wrapper.set_content(&ctx.props().content);
        }

        false
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let autoformat = {
            let onautoformat = ctx.link().callback(|_| Msg::Autoformat);
            if ctx.props().onautoformat.is_some() {
                html! {
                    <span
                        onclick={onautoformat}
                        class="material-symbols-outlined icon"
                    >{"auto_fix_high"}</span>
                }
            } else {
                html! {}
            }
        };

        let delete = {
            let ondelete = ctx.link().callback(|_| Msg::Delete);
            if ctx.props().onautoformat.is_some() {
                html! {
                    <span
                        onclick={ondelete}
                        class="material-symbols-outlined icon"
                    >{"delete"}</span>
                }
            } else {
                html! {}
            }
        };

        let discard = {
            let ondiscard = ctx.link().callback(|_| Msg::Discard);
            if ctx.props().onautoformat.is_some() {
                html! {
                    <span
                        onclick={ondiscard}
                        class="material-symbols-outlined icon"
                    >{"cancel"}</span>
                }
            } else {
                html! {}
            }
        };

        let save = {
            let onsave = ctx.link().callback(|_| Msg::Save);
            if ctx.props().onsave.is_some() {
                html! {
                    <span
                        onclick={onsave}
                        class="material-symbols-outlined icon"
                    >{"save"}</span>
                }
            } else {
                html! {}
            }
        };

        html! {
            <div class={Style::new(include_str!("editor.css")).expect("Unwrapping CSS should work!")}>
                <div class={"controlls"}>
                    {autoformat}
                    {delete}
                    {discard}
                    {save}
                </div>
                <div class={&self.code_mirror_style_class} style="min-width: 100px;">
                    <textarea id={self.editor_name.clone()} default_value={String::new()} />
                </div>
            </div>
        }
    }

    fn destroy(&mut self, _ctx: &Context<Self>) {
        if let Some(code_mirror_wrapper) = &self.code_mirror_wrapper {
            code_mirror_wrapper.clean();
        }
    }
}
