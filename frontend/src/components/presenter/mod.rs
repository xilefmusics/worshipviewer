mod data;
mod outline;
#[allow(clippy::module_inception)]
mod presenter;
mod query;
mod settings;
mod sidebar;
mod slide;
mod slide_sync;
mod slides;
mod toc;

use data::{OutlineData, SongData};
use outline::Outline;
pub use presenter::Presenter;
pub use query::Query;
use settings::Settings;
pub use settings::SettingsData;
use sidebar::{Sidebar, SidebarPanel};
use slide::{
    HorizontalContainerAlignment, SlideTextOrientation, TextAlignment, TextShadow, TextTransform,
};
pub use slide::{Slide, SlideProps};
pub use slide_sync::SlideSync;
use slides::Slides;
use toc::{Toc, TocItem};
