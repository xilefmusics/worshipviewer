use super::SlideProps;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use web_sys::window;

const STORAGE_KEY: &str = "worshipviewer_slide_data";

type StorageEventHandler = Rc<RefCell<Option<Closure<dyn FnMut(web_sys::StorageEvent)>>>>;

pub struct SlideSync {
    _closure: StorageEventHandler,
}

impl SlideSync {
    pub fn new() -> Self {
        Self {
            _closure: Rc::new(RefCell::new(None)),
        }
    }

    pub fn broadcast(&self, data: &SlideProps) {
        if let Some(window) = window() {
            if let Ok(Some(storage)) = window.local_storage() {
                if let Ok(json) = serde_json::to_string(data) {
                    if let Err(e) = storage.set_item(STORAGE_KEY, &json) {
                        gloo::console::error!(&format!("Failed to store slide data: {:?}", e));
                    }
                }
            }
        }
    }

    pub fn setup_listener<F>(&mut self, callback: F)
    where
        F: Fn(SlideProps) + 'static,
    {
        let callback_rc = Rc::new(RefCell::new(callback));
        let callback_clone = callback_rc.clone();

        // Check initial value
        if let Some(window) = window() {
            if let Ok(Some(storage)) = window.local_storage() {
                if let Some(initial_value) = storage.get_item(STORAGE_KEY).ok().flatten() {
                    if let Ok(data) = serde_json::from_str::<SlideProps>(&initial_value) {
                        callback_rc.borrow()(data);
                    }
                }
            }
        }

        // Set up storage event listener
        let closure = Closure::wrap(Box::new(move |e: web_sys::StorageEvent| {
            if e.key() == Some(STORAGE_KEY.to_string()) {
                if let Some(new_value) = e.new_value() {
                    if let Ok(data) = serde_json::from_str::<SlideProps>(&new_value) {
                        callback_clone.borrow()(data);
                    }
                }
            }
        }) as Box<dyn FnMut(web_sys::StorageEvent)>);

        if let Some(window) = window() {
            window.set_onstorage(Some(closure.as_ref().unchecked_ref()));
        }

        *self._closure.borrow_mut() = Some(closure);
    }
}

impl Default for SlideSync {
    fn default() -> Self {
        Self::new()
    }
}
