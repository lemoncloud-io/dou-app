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
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
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
