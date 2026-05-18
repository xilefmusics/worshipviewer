mod code_mirror_wrapper;
#[allow(clippy::module_inception)]
mod editor;
mod syntax_parser;

use code_mirror_wrapper::CodeMirrorWrapper;
pub use editor::Editor;
pub use syntax_parser::SyntaxParser;
