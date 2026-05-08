use stylist::{style, yew::styled_component};
use wasm_bindgen_futures::spawn_local;
use web_sys::window;
use yew::prelude::*;

use crate::api::use_api;
use crate::components::toast_notifications::show_error;
use crate::components::LegalLinks;

#[styled_component(LoginPage)]
pub fn login() -> Html {
    let api = use_api();
    let signup = use_state(|| false);
    let otp_requested = use_state(|| false);

    let email_input_ref = use_node_ref();
    let otp_input_ref = use_node_ref();

    let toogle_signup = {
        let signup = signup.clone();
        Callback::from(move |_| {
            signup.set(!*signup);
        })
    };

    let on_otp = {
        let otp_requested = otp_requested.clone();
        let email_input_ref = email_input_ref.clone();
        let otp_input_ref = otp_input_ref.clone();
        let api = api.clone();
        Callback::from(move |_| {
            let email = email_input_ref
                .cast::<web_sys::HtmlInputElement>()
                .map(|input| input.value())
                .unwrap_or_default();
            let otp = otp_input_ref
                .cast::<web_sys::HtmlInputElement>()
                .map(|input| input.value())
                .unwrap_or_default();

            if *otp_requested {
                let code = otp.trim().to_string();
                if code.is_empty() {
                    show_error("Code required", "Enter the one-time code from your email.");
                    return;
                }
                let api = api.clone();
                spawn_local(async move {
                    match api.verify_otp(email, code).await {
                        Ok(_) => api.route_index(),
                        Err(e) => show_error("Login failed", &e.to_string()),
                    }
                });
            } else {
                let email = email.trim().to_string();
                if email.is_empty() {
                    show_error("Email required", "Enter your email address.");
                    return;
                }
                let otp_requested = otp_requested.clone();
                let api = api.clone();
                spawn_local(async move {
                    match api.request_otp(email).await {
                        Ok(()) => otp_requested.set(true),
                        Err(e) => show_error("Could not send code", &e.to_string()),
                    }
                });
            }
        })
    };

    let make_oidc_callback = {
        let api = api.clone();
        move |provider: &'static str| {
            let api = api.clone();
            Callback::from(move |_| {
                let api = api.clone();
                if let Some(window) = window() {
                    let _ = window
                        .location()
                        .set_href(&api.auth_login_url(Some(provider)));
                }
            })
        }
    };
    let on_google = make_oidc_callback("google");
    //let on_apple = make_oidc_callback("apple");

    let page_style = style!(
        r#"
            width: 100%;
            min-height: 100vh;
            padding: 24px;
            margin: 0;
            background: var(--bg-dark);
            color: var(--text);
            font-family: "Rubik", sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;

            & * {
                box-sizing: inherit;
            }

            & main {
                width: min(460px, 100%);
                display: flex;
                flex-direction: column;
                gap: 24px;
            }

            & .lead {
                position: relative;
                display: flex;
                flex-direction: column;
                gap: 8px;
                text-align: center;
                border-radius: 20px;
                padding: 24px;
                background: var(--bg-dark);
            }

            & .lead__eyebrow {
                font-size: 0.8rem;
                letter-spacing: 0.14em;
                text-transform: uppercase;
                color: var(--text-muted);
            }

            & .lead h1 {
                margin: 0;
                font-size: 1.6rem;
                font-weight: 600;
                color: var(--text);
            }

            & .lead p {
                margin: 0 auto;
                max-width: 35ch;
                color: var(--text-muted);
                font-size: 0.95rem;
                line-height: 1.5;
            }

            & .auth-card {
                background: var(--bg);
                border-radius: 24px;
                padding: 32px;
                box-shadow: var(--shadow-s);
                display: flex;
                flex-direction: column;
                gap: 24px;
                position: relative;
            }

            & header h1 {
                margin: 0;
                font-size: 1.75rem;
                font-weight: 600;
            }

            & header p {
                margin: 8px 0 0;
                color: var(--text-muted);
                font-size: 0.95rem;
                line-height: 1.5;
            }

            & .form {
                display: flex;
                flex-direction: column;
                gap: 18px;
            }

            & .field {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            & label {
                font-size: 0.95rem;
                font-weight: 500;
            }

            & input {
                padding: 12px 14px;
                border-radius: 12px;
                border: 1px solid transparent;
                background: var(--bg-light);
                color: var(--text);
                font-size: 1rem;
                transition:
                    border-color 0.2s ease,
                    box-shadow 0.2s ease;
            }

            & input:focus {
                outline: none;
                border-color: var(--primary);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent);
            }

            & button {
                border: 1px solid transparent;
                border-radius: 16px;
                padding: 12px 18px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                background: var(--bg-light);
                color: var(--text);
                transition:
                    transform 0.2s ease,
                    box-shadow 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                box-shadow: var(--shadow-m);
            }

            & button:hover {
                transform: translateY(-1px);
                box-shadow: var(--shadow-l);
            }

            & .button--primary {
                background: var(--primary);
                color: var(--bg);
            }

            & .button--ghost {
                background: transparent;
                border-color: var(--text-muted);
            }

            & .divider {
                position: relative;
                text-align: center;
                font-size: 0.85rem;
                color: var(--text-muted);
            }

            & .divider::before,
            & .divider::after {
                content: "";
                position: absolute;
                top: 50%;
                width: 38%;
                height: 1px;
            }

            & .divider::before {
                left: 0;
                background: linear-gradient(90deg, var(--text-muted), transparent);
            }

            & .divider::after {
                right: 0;
                background: linear-gradient(90deg, transparent, var(--text-muted));
            }

            & .divider span {
                padding: 0 6px;
            }

            & .icon {
                width: 20px;
                height: 20px;
            }

            & footer {
                text-align: center;
                font-size: 0.9rem;
                color: var(--text-muted);
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            & footer a {
                color: var(--primary);
                text-decoration: none;
                font-weight: 500;
                cursor: pointer;
            }

            & footer a:hover {
                text-decoration: underline;
            }

            @media (max-width: 480px) {
                & .auth-card {
                    padding: 24px;
                }

                & header h1 {
                    font-size: 1.5rem;
                }
            }
        "#
    )
    .expect("login page styles");

    html! {
        <div class={page_style}>
            <main>
                <section class="lead">
                    <span class="lead__eyebrow">{ "All for His glory" }</span>
                    <h1>{ "Helps you lead worship — then steps aside when the Spirit takes over." }</h1>
                    <p>{ "Focus on the room not the screen! Don't make music - worship!" }</p>
                </section>
                <section class="auth-card">

                    { if *signup { html!{
                        <header>
                            <h1>{ "Welcome" }</h1>
                            <p>{ "Enter your details to create an account." }</p>
                        </header>
                    }} else { html! {
                        <header>
                            <h1>{ "Welcome back" }</h1>
                            <p>{ "Enter your details to access your account." }</p>
                        </header>
                    }}}

                    <form class="form" novalidate=true>
                        <div class="field">
                            <label for="email">{ "Email" }</label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="you@example.com"
                                autocomplete="email"
                                required=true
                                disabled={*otp_requested}
                                ref={email_input_ref}
                            />
                        </div>
                        { if *otp_requested { html!{
                            <div class="field">
                                <label for="otp">{ "One-time code" }</label>
                                <input
                                    id="otp"
                                    name="otp"
                                    type="password"
                                    placeholder="••••••"
                                    autocomplete="one-time-code"
                                    inputmode="numeric"
                                    pattern="[0-9]*"
                                    ref={otp_input_ref}
                                />
                            </div>
                        }} else {html!{}}}
                        <button type="button" onclick={on_otp} class="button--primary">{if *otp_requested{"Validate"} else {"Continue"}}</button>
                        <div class="divider">
                            <span>{ "Or continue with" }</span>
                        </div>
                        <button type="button" class="button--ghost" onclick={on_google}>
                            <svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                                <path d="M21.6 12.227c0-.68-.061-1.333-.176-1.96H12v3.708h5.421a4.63 4.63 0 0 1-2.009 3.04v2.528h3.245c1.898-1.748 2.994-4.322 2.994-7.316Z" fill="#4285F4" />
                                <path d="M12 22c2.7 0 4.968-.896 6.624-2.416l-3.245-2.528c-.896.6-2.043.952-3.379.952-2.6 0-4.799-1.758-5.588-4.118H3.037v2.59A9.996 9.996 0 0 0 12 22Z" fill="#34A853" />
                                <path d="M6.412 13.89A5.99 5.99 0 0 1 6.098 12c0-.657.12-1.29.314-1.89V7.52H3.037A9.996 9.996 0 0 0 2 12c0 1.61.38 3.134 1.037 4.48l3.375-2.59Z" fill="#FBBC04" />
                                <path d="M12 6.4c1.468 0 2.784.506 3.821 1.493l2.862-2.862C16.96 2.674 14.7 1.6 12 1.6A9.996 9.996 0 0 0 3.037 7.52l3.375 2.59C7.201 8.158 9.4 6.4 12 6.4Z" fill="#EA4335" />
                            </svg>
                            { "Google" }
                        </button>
                        //<button type="button" class="button--ghost" onclick={on_apple}>
                        //    <svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                        //        <path fill="currentColor" d="M17.806 13.995c-.031-3.031 2.484-4.487 2.599-4.556-1.419-2.073-3.626-2.355-4.404-2.382-1.872-.19-3.653 1.096-4.604 1.096-.95 0-2.415-1.068-3.978-1.037-2.04.031-3.925 1.188-4.972 3.009-2.121 3.676-.54 9.108 1.523 12.094 1.007 1.452 2.21 3.075 3.775 3.016 1.512-.062 2.079-.984 3.899-.984 1.82 0 2.325.984 3.921.954 1.625-.031 2.648-1.484 3.651-2.939 1.146-1.677 1.618-3.301 1.648-3.387-.036-.017-3.152-1.21-3.158-4.884zm-2.903-9.101c.821-.996 1.375-2.386 1.221-3.77-1.183.047-2.61.789-3.457 1.785-.759.884-1.422 2.297-1.246 3.647 1.312.102 2.662-.666 3.482-1.662z" />
                        //    </svg>
                        //    { "Apple" }
                        //</button>
                    </form>
                    <footer>
                        { if *signup { html!{
                            <p>
                                { "Already have an account? " }
                                <a onclick={toogle_signup}>{ "Login" }</a>
                            </p>
                        }} else { html! {
                            <p>
                                { "New here? " }
                                <a onclick={toogle_signup}>{ "Create an account" }</a>
                            </p>
                        }}}
                        <LegalLinks />
                    </footer>
                </section>
            </main>
        </div>
    }
}
