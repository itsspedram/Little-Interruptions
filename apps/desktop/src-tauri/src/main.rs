// Keeps Windows release builds from opening a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod idle;
mod sound;

use std::{
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent,
};

/// How often the heartbeat reaches the engine living in the hidden settings window.
const TICK_EVERY: Duration = Duration::from_secs(5);

/// Popup layout in logical (point) units; the window itself is declared in tauri.conf.json.
const POPUP_WIDTH: f64 = 360.0;
const POPUP_HEIGHT: f64 = 112.0;
const POPUP_MARGIN: f64 = 12.0;
/// Space to leave for the menu bar (macOS) or the taskbar (everything else).
const POPUP_EDGE_GAP: f64 = 36.0;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TickPayload {
    now: u64,
    idle_seconds: f64,
    gap_ms: u64,
}

#[derive(Clone, Serialize)]
struct BellPayload {
    id: String,
    category: String,
    text: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

/// Puts the popup in the top-right corner on macOS, bottom-right elsewhere.
fn place_popup(popup: &WebviewWindow) {
    let Ok(Some(monitor)) = popup.primary_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let origin = monitor.position();
    let size = monitor.size();

    let x = origin.x as f64 + size.width as f64 - (POPUP_WIDTH + POPUP_MARGIN) * scale;
    let y = if cfg!(target_os = "macos") {
        origin.y as f64 + POPUP_EDGE_GAP * scale
    } else {
        origin.y as f64 + size.height as f64
            - (POPUP_HEIGHT + POPUP_EDGE_GAP + POPUP_MARGIN) * scale
    };
    let _ = popup.set_position(PhysicalPosition::new(x as i32, y as i32));
}

/// Shows the message in the popup and, if asked, rings the bell.
#[tauri::command]
fn show_popup(
    app: AppHandle,
    id: String,
    category: String,
    text: String,
    sound: bool,
) -> Result<(), String> {
    let popup = app
        .get_webview_window("popup")
        .ok_or_else(|| "the popup window is missing".to_string())?;
    place_popup(&popup);
    popup.show().map_err(|error| error.to_string())?;
    app.emit_to("popup", "bell", BellPayload { id, category, text })
        .map_err(|error| error.to_string())?;
    if sound {
        sound::play_bell();
    }
    Ok(())
}

#[tauri::command]
fn hide_popup(app: AppHandle) {
    if let Some(popup) = app.get_webview_window("popup") {
        let _ = popup.hide();
    }
}

fn show_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let ring_now = MenuItem::with_id(app, "ring_now", "Ring now", true, None::<&str>)?;
    let pause_hour = MenuItem::with_id(app, "pause_1h", "Quiet for 1 hour", true, None::<&str>)?;
    let pause_three = MenuItem::with_id(app, "pause_3h", "Quiet for 3 hours", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", "Back to normal", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Little Interruptions", true, None::<&str>)?;
    let first_separator = PredefinedMenuItem::separator(app)?;
    let second_separator = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &ring_now,
            &first_separator,
            &pause_hour,
            &pause_three,
            &resume,
            &second_separator,
            &settings,
            &quit,
        ],
    )?;

    // A black bell on a transparent background; macOS recolors it for light and dark menu bars.
    let icon = Image::from_bytes(include_bytes!("../icons/tray.png"))?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Little Interruptions")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "settings" => show_settings(app),
            // Everything else is handled by the engine in the settings window.
            other => {
                let _ = app.emit_to("main", "menu", other.to_string());
            }
        })
        .build(app)?;
    Ok(())
}

/// Sends the engine a heartbeat every few seconds. Timing lives here, in Rust,
/// because a hidden web view throttles its own timers.
fn start_ticker(app: AppHandle) {
    thread::spawn(move || {
        let mut last = now_ms();
        let mut first = true;
        loop {
            thread::sleep(TICK_EVERY);
            let now = now_ms();
            let gap_ms = if first { 0 } else { now.saturating_sub(last) };
            first = false;
            last = now;
            let _ = app.emit_to(
                "main",
                "tick",
                TickPayload {
                    now,
                    idle_seconds: idle::idle_seconds(),
                    gap_ms,
                },
            );
        }
    });
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![show_popup, hide_popup])
        .on_window_event(|window, event| {
            // Closing the settings window only hides it; the app lives in the tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            build_tray(app)?;
            start_ticker(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Little Interruptions");
}
