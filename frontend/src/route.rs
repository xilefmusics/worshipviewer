use super::pages::{
    CollectionsPage, EditorPage, IndexPage, LoginPage, LogoutPage, PlayerPage, PresenterPage,
    PresenterSlidesPage, SetlistEditorPage, SetlistsPage, SongsPage,
};
use crate::components::layouts::{NavItemBuilder, Navable, VerticalLayout as Layout};
use yew::prelude::*;
use yew_router::prelude::*;

#[derive(Clone, Routable, PartialEq)]
pub enum Route {
    #[at("/")]
    Index,
    #[at("/collections")]
    Collections,
    #[at("/songs")]
    Songs,
    #[at("/setlists")]
    Setlists,
    #[at("/player")]
    Player,
    #[at("/presenter")]
    Presenter,
    #[at("/presenter/slides")]
    PresenterSlides,
    #[at("/editor")]
    Editor,
    #[at("/setlist-editor")]
    SetlistEditor,
    #[at("/login")]
    Login,
    #[at("/logout")]
    Logout,
    #[not_found]
    #[at("/404")]
    NotFound,
}

impl Navable for Route {
    fn route_items() -> Vec<Self> {
        vec![Route::Collections, Route::Songs, Route::Setlists]
    }

    fn to_nav_item(self) -> NavItemBuilder<'static> {
        match self {
            Route::Index => NavItemBuilder::new()
                .path("/home")
                .callback(Callback::from(|navigator: Navigator| {
                    navigator.push(&Route::Index)
                }))
                .index(),
            Route::Collections => NavItemBuilder::new()
                .path("/collections")
                .icon("menu_book")
                .callback(Callback::from(|navigator: Navigator| {
                    navigator.push(&Route::Collections)
                })),
            Route::Songs => NavItemBuilder::new()
                .path("/songs")
                .icon("library_music")
                .callback(Callback::from(|navigator: Navigator| {
                    navigator.push(&Route::Songs)
                })),
            Route::Setlists => NavItemBuilder::new()
                .path("/setlists")
                .icon("receipt_long")
                .callback(Callback::from(|navigator: Navigator| {
                    navigator.push(&Route::Setlists)
                })),
            _ => NavItemBuilder::new(),
        }
    }

    fn render(route: Route) -> Html {
        html! {
            <Layout<Route>
                nav_routes={Route::route_items()}
                fullscreen={matches!(route, Route::Player | Route::Editor | Route::SetlistEditor | Route::Login | Route::Logout | Route::Presenter | Route::PresenterSlides)}
            >{
                match route {
                    Route::Index => html! { <IndexPage /> },
                    Route::Collections => html! { <CollectionsPage /> },
                    Route::Songs => html! { <SongsPage /> },
                    Route::Setlists => html! { <SetlistsPage /> },
                    Route::Player => html! { <PlayerPage /> },
                    Route::Presenter => html! { <PresenterPage /> },
                    Route::PresenterSlides => html! { <PresenterSlidesPage /> },
                    Route::Editor => html! { <EditorPage /> },
                    Route::SetlistEditor => html! { <SetlistEditorPage /> },
                    Route::Login => html! { <LoginPage /> },
                    Route::Logout => html! { <LogoutPage /> },
                    Route::NotFound => html! { <h1>{ "404 Not Found" }</h1> },
        }}
            </Layout<Route>>
        }
    }
}
