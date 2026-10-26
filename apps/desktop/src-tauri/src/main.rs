// Keeps Windows release builds from opening a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod busy;
mod idle;
mod mic;
mod sound;

use std::{
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Rect, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;

/// How often the heartbeat reaches the engine living in the hidden settings window.
const TICK_EVERY: Duration = Duration::from_secs(5);
/// Asking the system whether the user is busy costs a process launch, so do it every Nth tick.
const BUSY_CHECK_EVERY_TICKS: u32 = 3;

const TRAY_ID: &str = "main";
const PANEL_MARGIN: f64 = 8.0;
/// A click on the tray icon while the panel is open first blurs (hides) the panel and then
/// reaches us as a click. Within this window we treat that click as "close", not "reopen".
const PANEL_REOPEN_GUARD_MS: u64 = 300;

/// When the panel last hid itself because it lost focus.
static PANEL_HIDDEN_AT: AtomicU64 = AtomicU64::new(0);

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
    busy: bool,
    mic_in_use: bool,
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

/// Shows the message the way the user chose ("card", "overlay" or "notification")
/// and, if asked, rings the bell. A style that cannot be shown falls back to the card.
#[tauri::command]
fn show_popup(
    app: AppHandle,
    id: String,
    category: String,
    text: String,
    sound: bool,
    style: String,
) -> Result<(), String> {
    let payload = BellPayload { id, category, text };
    let shown = match style.as_str() {
        "overlay" => show_overlay(&app, &payload),
        "notification" => show_notification(&app, &payload),
        _ => Err("card".to_string()),
    };
    if shown.is_err() {
        show_card(&app, payload)?;
    }
    if sound {
        sound::play_bell();
    }
    Ok(())
}

fn show_card(app: &AppHandle, payload: BellPayload) -> Result<(), String> {
    let popup = app
        .get_webview_window("popup")
        .ok_or_else(|| "the popup window is missing".to_string())?;
    place_popup(&popup);
    popup.show().map_err(|error| error.to_string())?;
    app.emit_to("popup", "bell", payload)
        .map_err(|error| error.to_string())
}

/// A translucent layer over the whole primary screen; a click or Esc dismisses it.
fn show_overlay(app: &AppHandle, payload: &BellPayload) -> Result<(), String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| "the overlay window is missing".to_string())?;
    let monitor = overlay
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "no monitor".to_string())?;
    let origin = monitor.position();
    let size = monitor.size();
    overlay
        .set_position(PhysicalPosition::new(origin.x, origin.y))
        .map_err(|error| error.to_string())?;
    overlay
        .set_size(PhysicalSize::new(size.width, size.height))
        .map_err(|error| error.to_string())?;
    overlay.show().map_err(|error| error.to_string())?;
    // Focus lets Esc work; it also moves focus away from whatever the user was typing in.
    let _ = overlay.set_focus();
    app.emit_to("overlay", "bell", payload.clone())
        .map_err(|error| error.to_string())
}

fn show_notification(app: &AppHandle, payload: &BellPayload) -> Result<(), String> {
    app.notification()
        .builder()
        .title("Little Interruptions")
        .body(payload.text.as_str())
        .show()
        .map_err(|error| error.to_string())
}

/// Updates the text next to the menu bar icon and the hover tooltip.
#[tauri::command]
fn set_tray_status(app: AppHandle, title: String, tooltip: String) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(if title.is_empty() {
            None
        } else {
            Some(title.as_str())
        });
        let _ = tray.set_tooltip(Some(tooltip.as_str()));
    }
}

/// Registers or removes the app as a login item so it matches the user's choice.
/// Debug builds leave the system alone: they would register the development binary.
#[tauri::command]
fn set_launch_at_login(app: AppHandle, enabled: bool) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Ok(());
    }
    let launcher = app.autolaunch();
    let registered = launcher.is_enabled().map_err(|error| error.to_string())?;
    if enabled && !registered {
        launcher.enable().map_err(|error| error.to_string())?;
    } else if !enabled && registered {
        launcher.disable().map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Lets the first-run setup bring the settings window to the front on its own.
#[tauri::command]
fn open_settings(app: AppHandle) {
    show_settings(&app);
}

/// Buttons in the quick panel. Most are handled by the engine; a few need the shell.
#[tauri::command]
fn panel_action(app: AppHandle, id: String) {
    // Changing the interval keeps the panel open so the change can be seen; everything else closes it.
    if !id.starts_with("interval:") {
        hide_panel(&app);
    }
    match id.as_str() {
        "quit" => app.exit(0),
        "settings" => show_settings(&app),
        "close" => {}
        other => {
            let _ = app.emit_to("main", "menu", other.to_string());
        }
    }
}

#[tauri::command]
fn hide_overlay(app: AppHandle) {
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
    }
}

#[tauri::command]
fn hide_popup(app: AppHandle) {
    if let Some(popup) = app.get_webview_window("popup") {
        let _ = popup.hide();
    }
}

fn hide_panel(app: &AppHandle) {
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.hide();
    }
}

/// Opens the quick panel under the tray icon, or closes it if it is already open.
fn toggle_panel(app: &AppHandle, icon: Rect) {
    let Some(panel) = app.get_webview_window("panel") else {
        return;
    };
    if panel.is_visible().unwrap_or(false) {
        let _ = panel.hide();
        return;
    }
    if now_ms().saturating_sub(PANEL_HIDDEN_AT.load(Ordering::Relaxed)) < PANEL_REOPEN_GUARD_MS {
        return;
    }
    place_panel(&panel, icon);
    let _ = panel.show();
    let _ = panel.set_focus();
    // Ask the engine to send fresh numbers right away.
    let _ = app.emit_to("main", "menu", "panel_opened".to_string());
}

/// Centers the panel under the tray icon on macOS (menu bar on top) and above it elsewhere
/// (taskbar at the bottom), keeping it inside the screen.
fn place_panel(panel: &WebviewWindow, icon: Rect) {
    let scale = panel.scale_factor().unwrap_or(1.0);
    let icon_position = icon.position.to_physical::<f64>(scale);
    let icon_size = icon.size.to_physical::<f64>(scale);
    let Ok(panel_size) = panel.outer_size() else {
        return;
    };
    let width = panel_size.width as f64;
    let height = panel_size.height as f64;
    let margin = PANEL_MARGIN * scale;

    let mut x = icon_position.x + icon_size.width / 2.0 - width / 2.0;
    if let Ok(Some(monitor)) = panel.primary_monitor() {
        let left = monitor.position().x as f64 + margin;
        let right = monitor.position().x as f64 + monitor.size().width as f64 - width - margin;
        x = x.min(right).max(left);
    }
    let y = if cfg!(target_os = "macos") {
        icon_position.y + icon_size.height + 4.0 * scale
    } else {
        icon_position.y - height - margin
    };
    let _ = panel.set_position(PhysicalPosition::new(x as i32, y as i32));
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

    // Left click opens the quick panel; right click (or ctrl-click) shows this menu.
    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Little Interruptions")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                toggle_panel(tray.app_handle(), rect);
            }
        })
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
        let mut ticks_until_busy_check = 0;
        let mut busy = false;
        loop {
            thread::sleep(TICK_EVERY);
            let now = now_ms();
            let gap_ms = if first { 0 } else { now.saturating_sub(last) };
            first = false;
            last = now;

            if ticks_until_busy_check == 0 {
                busy = busy::is_busy();
                ticks_until_busy_check = BUSY_CHECK_EVERY_TICKS;
            }
            ticks_until_busy_check -= 1;
            let _ = app.emit_to(
                "main",
                "tick",
                TickPayload {
                    now,
                    idle_seconds: idle::idle_seconds(),
                    gap_ms,
                    busy,
                    // Cheap (no process launch), so it is read on every heartbeat.
                    mic_in_use: mic::is_in_use(),
                },
            );
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            show_popup,
            hide_popup,
            hide_overlay,
            set_tray_status,
            panel_action,
            open_settings,
            set_launch_at_login
        ])
        .on_window_event(|window, event| match event {
            // Closing the settings window only hides it; the app lives in the tray.
            WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                api.prevent_close();
                let _ = window.hide();
            }
            // The quick panel behaves like a menu: clicking anywhere else dismisses it.
            WindowEvent::Focused(false) if window.label() == "panel" => {
                PANEL_HIDDEN_AT.store(now_ms(), Ordering::Relaxed);
                let _ = window.hide();
            }
            _ => {}
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
