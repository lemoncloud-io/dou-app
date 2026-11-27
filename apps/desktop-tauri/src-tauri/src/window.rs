use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

use crate::profile::Paths;

#[cfg(target_os = "macos")]
fn isolate_storage<'a, R: tauri::Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
    paths: &Paths,
) -> WebviewWindowBuilder<'a, R, M> {
    builder.data_store_identifier(paths.store_identifier())
}

#[cfg(not(target_os = "macos"))]
fn isolate_storage<'a, R: tauri::Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
    paths: &Paths,
) -> WebviewWindowBuilder<'a, R, M> {
    builder.data_directory(paths.webview_dir())
}

const DEV_WEB_URL: &str = "https://dou-dev.chatic.io";
const PROD_WEB_URL: &str = "https://dou.chatic.io";

pub fn web_url() -> String {
    if let Some(url) = option_env!("DOU_WEB_URL") {
        return url.to_string();
    }
    if cfg!(debug_assertions) {
        DEV_WEB_URL
    } else {
        PROD_WEB_URL
    }
    .to_string()
}

pub fn loader_path(web: &str) -> String {
    let query = Url::parse_with_params("http://x/", &[("to", web)])
        .map(|u| u.query().unwrap_or_default().to_string())
        .unwrap_or_default();
    format!("index.html?{query}")
}

pub fn open_main(
    app: &AppHandle,
    web: &str,
    init_script: &str,
    profile: Option<&Paths>,
) -> tauri::Result<()> {
    let path = loader_path(web);
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App(path.into()))
        .title("DoU")
        .initialization_script(init_script)
        .inner_size(1100.0, 760.0)
        .min_inner_size(420.0, 560.0);
    if let Some(paths) = profile {
        builder = isolate_storage(builder, paths);
    }
    builder.build()?;
    Ok(())
}

pub const AGENT_MENU_ID: &str = "open-agent";

pub fn open_agent(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("agent") {
        window.unminimize()?;
        window.show()?;
        return window.set_focus();
    }
    WebviewWindowBuilder::new(app, "agent", WebviewUrl::App("agent/index.html".into()))
        .title("DoU Agent")
        .inner_size(720.0, 640.0)
        .min_inner_size(560.0, 480.0)
        .build()?;
    Ok(())
}

pub fn install_menu(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    let open = MenuItem::with_id(
        app,
        AGENT_MENU_ID,
        "Open DoU Agent…",
        true,
        Some("CmdOrCtrl+Shift+A"),
    )?;
    menu.append(&Submenu::with_items(app, "Agent", true, &[&open])?)?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == AGENT_MENU_ID {
            let _ = open_agent(app);
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_loader_carries_the_web_url_encoded() {
        assert_eq!(
            loader_path("https://dou-dev.chatic.io"),
            "index.html?to=https%3A%2F%2Fdou-dev.chatic.io"
        );
    }
}
