mod page;
mod pages;
#[allow(clippy::module_inception)]
mod player;
mod toc;

use page::PageComponent;
use pages::PagesComponent;
pub use player::PlayerPage;
use toc::TableOfContentsComponent;
