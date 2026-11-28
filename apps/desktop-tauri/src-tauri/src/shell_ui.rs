use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const SHORTCUT: &str = "CommandOrControl+Alt+D";
const OPEN_ID: &str = "tray-open";
const AGENT_ID: &str = "tray-agent";
const QUIT_ID: &str = "tray-quit";

#[derive(Debug, PartialEq, Eq)]
pub enum Toggle {
    Show,
    Hide,
}

pub fn toggle_action(visible: bool, minimized: bool, focused: bool) -> Toggle {
    if visible && !minimized && focused {
        Toggle::Hide
    } else {
        Toggle::Show
    }
}

pub fn show_main(app: &AppHandle) {
    let handle = app.clone();
    if let Err(error) = app.run_on_main_thread(move || show_main_now(&handle)) {
        eprintln!("the main window could not be shown: {error}");
    }
}

fn show_main_now(app: &AppHandle) {
    if app.get_webview_window("main").is_none()
        && let Err(error) = crate::window::recreate_main(app)
    {
        eprintln!("the main window could not be reopened: {error}");
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    bring_app_forward();
}

#[cfg(target_os = "macos")]
fn bring_app_forward() {
    if let Some(main_thread) = objc2::MainThreadMarker::new() {
        #[expect(
            deprecated,
            reason = "NSApplication.activate() needs macOS 14; this call still activates there and on older systems"
        )]
        objc2_app_kit::NSApplication::sharedApplication(main_thread)
            .activateIgnoringOtherApps(true);
    }
}

#[cfg(not(target_os = "macos"))]
fn bring_app_forward() {}

fn toggle_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        show_main(app);
        return;
    };
    let action = toggle_action(
        window.is_visible().unwrap_or(false),
        window.is_minimized().unwrap_or(false),
        window.is_focused().unwrap_or(false),
    );
    match action {
        Toggle::Hide => {
            let _ = window.hide();
        }
        Toggle::Show => show_main(app),
    }
}

pub fn shortcut_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                toggle_main(app);
            }
        })
        .build()
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    if let Err(error) = app.global_shortcut().register(SHORTCUT) {
        eprintln!("the {SHORTCUT} shortcut is unavailable: {error}");
    }

    let open = MenuItem::with_id(app, OPEN_ID, "Open DoU", true, None::<&str>)?;
    let agent = MenuItem::with_id(app, AGENT_ID, "Open DoU Agent…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT_ID, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&open, &agent, &PredefinedMenuItem::separator(app)?, &quit],
    )?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("DoU")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN_ID => show_main(app),
            AGENT_ID => {
                let _ = crate::window::open_agent(app);
            }
            QUIT_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_focused_visible_window_hides_and_anything_else_shows() {
        assert_eq!(toggle_action(true, false, true), Toggle::Hide);
        assert_eq!(toggle_action(true, false, false), Toggle::Show);
        assert_eq!(toggle_action(false, false, false), Toggle::Show);
        assert_eq!(toggle_action(true, true, true), Toggle::Show);
    }

    #[test]
    fn the_shortcut_parses() {
        assert!(
            SHORTCUT
                .parse::<tauri_plugin_global_shortcut::Shortcut>()
                .is_ok()
        );
    }
}
