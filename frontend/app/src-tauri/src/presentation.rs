use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    primary: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    id: String,
    kind: String,
    display: Option<Display>,
    status: String,
    session: String,
}

#[derive(Default)]
pub struct Outputs(Mutex<Vec<Output>>);

fn authorize(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Only the controller can manage outputs".into());
    }
    super::app_origin(window).map(|_| ())
}

fn displays(app: &AppHandle) -> Result<Vec<Display>, String> {
    let primary = app.primary_monitor().map_err(|e| e.to_string())?;
    if primary.is_none() {
        return Err("Could not identify the primary display".into());
    }
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .iter()
        .map(|m| Display {
            name: m.name().cloned().unwrap_or_else(|| "Display".into()),
            x: m.position().x,
            y: m.position().y,
            width: m.size().width,
            height: m.size().height,
            primary: primary
                .as_ref()
                .is_some_and(|p| p.position() == m.position() && p.size() == m.size()),
        })
        .collect())
}

fn matching_display<'a>(target: &Display, current: &'a [Display]) -> Option<&'a Display> {
    let matches: Vec<_> = current
        .iter()
        .filter(|d| !d.primary && d.name == target.name)
        .collect();
    matches
        .iter()
        .copied()
        .find(|d| d.x == target.x && d.y == target.y)
        .or_else(|| {
            if matches.len() == 1 {
                matches.first().copied()
            } else {
                None
            }
        })
}

fn display_target(
    display: &Display,
    available: &[Display],
) -> Result<PhysicalPosition<f64>, String> {
    let left = f64::from(display.x);
    let top = f64::from(display.y);
    let right = left + f64::from(display.width);
    let bottom = top + f64::from(display.height);
    let mut xs = vec![left, right];
    let mut ys = vec![top, bottom];
    for other in available.iter().filter(|d| *d != display) {
        for x in [
            f64::from(other.x),
            f64::from(other.x) + f64::from(other.width),
        ] {
            if x > left && x < right {
                xs.push(x);
            }
        }
        for y in [
            f64::from(other.y),
            f64::from(other.y) + f64::from(other.height),
        ] {
            if y > top && y < bottom {
                ys.push(y);
            }
        }
    }
    xs.sort_by(f64::total_cmp);
    ys.sort_by(f64::total_cmp);
    for x in xs.windows(2).map(|pair| (pair[0] + pair[1]) / 2.0) {
        for y in ys.windows(2).map(|pair| (pair[0] + pair[1]) / 2.0) {
            let covered = available.iter().filter(|d| *d != display).any(|d| {
                x >= f64::from(d.x)
                    && x < f64::from(d.x) + f64::from(d.width)
                    && y >= f64::from(d.y)
                    && y < f64::from(d.y) + f64::from(d.height)
            });
            if !covered {
                return Ok(PhysicalPosition::new(x, y));
            }
        }
    }
    Err("The selected display cannot be uniquely identified by its coordinates".into())
}

fn fullscreen_on_display(
    window: &WebviewWindow,
    position: PhysicalPosition<f64>,
) -> Result<(), String> {
    // Position first: macOS simple fullscreen uses the window's current monitor,
    // and Linux window managers may ignore the requested fullscreen monitor.
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    window.set_position(position).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    return window
        .set_simple_fullscreen(true)
        .map_err(|e| e.to_string());
    #[cfg(not(target_os = "macos"))]
    window
        .set_fullscreen_on_monitor(position)
        .map_err(|e| e.to_string())
}

fn open_window(app: &AppHandle, output: &Output, width: u32, height: u32) -> Result<(), String> {
    let target_position = output
        .display
        .as_ref()
        .map(|display| displays(app).and_then(|available| display_target(display, &available)))
        .transpose()?;
    let main = app
        .get_webview_window("main")
        .ok_or("Controller window unavailable")?;
    let mut url = super::app_origin(&main)?;
    url.set_path("/player/output");
    url.query_pairs_mut().append_pair("s", &output.session);
    if output.display.is_some() {
        url.query_pairs_mut().append_pair("nativeDisplay", "1");
    }
    let mut builder = WebviewWindowBuilder::new(app, &output.id, WebviewUrl::External(url))
        .title("Worship Viewer Presentation")
        .inner_size(width as f64, height as f64)
        .focused(false)
        .decorations(false)
        .shadow(false)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled);
    if output.display.is_some() {
        builder = builder.visible(false);
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    if let Some(position) = target_position {
        let result = fullscreen_on_display(&window, position);
        if let Err(error) = result {
            let _ = window.close();
            return Err(error);
        }
    }
    if output.display.is_some() {
        // Bound startup time if the hosted client cannot signal readiness or loading stalls.
        let app = app.clone();
        let id = output.id.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(300));
            if let Some(window) = app.get_webview_window(&id)
                && matches!(window.is_visible(), Ok(false))
            {
                let _ = window.show();
            }
        });
    }
    Ok(())
}

#[tauri::command]
pub fn presentation_displays(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Vec<Display>, String> {
    authorize(&window)?;
    displays(&app)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    kind: String,
    display: Option<Display>,
    session: String,
    width: u32,
    height: u32,
}

#[tauri::command]
pub async fn presentation_start(
    window: WebviewWindow,
    app: AppHandle,
    state: tauri::State<'_, Outputs>,
    options: StartOptions,
) -> Result<Output, String> {
    authorize(&window)?;
    let StartOptions {
        kind,
        display,
        session,
        width,
        height,
    } = options;
    if session != "shared" {
        return Err("Invalid presentation session".into());
    }
    if !(320..=7680).contains(&width) || !(180..=4320).contains(&height) {
        return Err("Invalid window dimensions".into());
    }
    let chosen = match kind.as_str() {
        "display" => {
            let available = displays(&app)?;
            Some(
                match display {
                    Some(d) => matching_display(&d, &available),
                    None => available.iter().find(|d| !d.primary),
                }
                .ok_or("No compatible external display is available")?
                .clone(),
            )
        }
        "share" => None,
        _ => return Err("Invalid output type".into()),
    };
    let output = Output {
        id: format!("presentation-{}", Uuid::new_v4().simple()),
        kind,
        display: chosen,
        status: "open".into(),
        session,
    };
    open_window(&app, &output, width, height)?;
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .push(output.clone());
    Ok(output)
}

#[tauri::command]
pub fn presentation_ready(window: WebviewWindow) -> Result<(), String> {
    if !window.label().starts_with("presentation-") {
        return Err("Only presentation windows can signal readiness".into());
    }
    super::app_origin(&window)?;
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn presentation_stop(
    window: WebviewWindow,
    app: AppHandle,
    state: tauri::State<'_, Outputs>,
    id: String,
) -> Result<(), String> {
    authorize(&window)?;
    let mut outputs = state.0.lock().map_err(|e| e.to_string())?;
    let Some(index) = outputs.iter().position(|o| o.id == id) else {
        return Err("Output not found".into());
    };
    if let Some(output) = app.get_webview_window(&id) {
        output.close().map_err(|e| e.to_string())?;
    }
    outputs.remove(index);
    Ok(())
}

#[tauri::command]
pub async fn presentation_outputs(
    window: WebviewWindow,
    app: AppHandle,
    state: tauri::State<'_, Outputs>,
) -> Result<Vec<Output>, String> {
    authorize(&window)?;
    let available = displays(&app)?;
    let mut outputs = state.0.lock().map_err(|e| e.to_string())?;
    outputs
        .retain(|output| output.kind == "display" || app.get_webview_window(&output.id).is_some());
    for output in outputs.iter_mut().filter(|o| o.kind == "display") {
        let display = output
            .display
            .as_ref()
            .and_then(|d| matching_display(d, &available))
            .cloned();
        match display {
            None => {
                if let Some(window) = app.get_webview_window(&output.id) {
                    let _ = window.close();
                }
                output.status = "disconnected".into();
            }
            Some(display) => {
                let changed = output.display.as_ref() != Some(&display);
                output.display = Some(display);
                if app.get_webview_window(&output.id).is_none() {
                    // Only restore windows closed because their monitor disappeared.
                    if output.status == "disconnected" || output.status == "failed" {
                        output.status = if open_window(&app, output, 1920, 1080).is_ok() {
                            "open"
                        } else {
                            "failed"
                        }
                        .into();
                    } else {
                        output.status = "closed".into();
                    }
                } else if changed && let Some(w) = app.get_webview_window(&output.id) {
                    let d = output.display.as_ref().expect("display exists");
                    output.status = if display_target(d, &available)
                        .and_then(|position| fullscreen_on_display(&w, position))
                        .is_ok()
                    {
                        "open"
                    } else {
                        "failed"
                    }
                    .into();
                }
            }
        }
    }
    outputs.retain(|o| o.status != "closed");
    Ok(outputs.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn display(name: &str, x: i32, primary: bool) -> Display {
        Display {
            name: name.into(),
            x,
            y: 0,
            width: 1920,
            height: 1080,
            primary,
        }
    }
    #[test]
    fn display_target_is_inside_monitors_with_negative_coordinates() {
        let target = display("Projector", -1920, false);
        let center = display_target(&target, std::slice::from_ref(&target)).unwrap();
        assert_eq!((center.x, center.y), (-960.0, 540.0));
        let primary = display("Primary", -500, true);
        let center = display_target(&target, &[target.clone(), primary]).unwrap();
        assert!(center.x < -500.0);
        assert!(
            display_target(
                &target,
                &[target.clone(), display("Overlapping", -1920, true)]
            )
            .is_err()
        );
    }

    #[test]
    fn matches_moved_unique_display_but_not_ambiguous_names() {
        let target = display("Projector", 1920, false);
        assert_eq!(
            matching_display(&target, &[display("Projector", -1920, false)])
                .unwrap()
                .x,
            -1920
        );
        assert!(
            matching_display(
                &target,
                &[
                    display("Projector", -1920, false),
                    display("Projector", 3840, false)
                ]
            )
            .is_none()
        );
        assert!(matching_display(&target, &[display("Projector", 1920, true)]).is_none());
    }
}
