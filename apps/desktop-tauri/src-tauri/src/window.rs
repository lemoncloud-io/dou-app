use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

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

static STARTED: OnceLock<Instant> = OnceLock::new();
static INIT_SCRIPT: OnceLock<String> = OnceLock::new();

const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
const LOAD_DEADLINE: Duration = Duration::from_secs(15);

pub fn offline_path(web: &str) -> String {
    let query = Url::parse_with_params("http://x/", &[("to", web)])
        .map(|u| u.query().unwrap_or_default().to_string())
        .unwrap_or_default();
    format!("offline.html?{query}")
}

pub fn offline_url(web: &str) -> Option<Url> {
    let base = if cfg!(windows) {
        "http://tauri.localhost/"
    } else {
        "tauri://localhost/"
    };
    Url::parse(base).ok()?.join(&offline_path(web)).ok()
}

pub fn probe_target(web: &str) -> Option<(String, u16)> {
    let url = Url::parse(web).ok()?;
    Some((url.host_str()?.to_string(), url.port_or_known_default()?))
}

#[derive(Default)]
pub struct Watchdog {
    state: Mutex<(u64, bool)>,
}

impl Watchdog {
    pub fn arm(&self) -> u64 {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.0 += 1;
        state.1 = false;
        state.0
    }

    pub fn finish(&self) {
        self.state.lock().unwrap_or_else(|e| e.into_inner()).1 = true;
    }

    pub fn should_fall_back(&self, armed: u64) -> bool {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.0 == armed && !state.1
    }

    pub fn unfinished(&self) -> bool {
        !self.state.lock().unwrap_or_else(|e| e.into_inner()).1
    }
}

fn show_offline(app: &AppHandle, web: &str) {
    #[cfg(debug_assertions)]
    eprintln!("the web is unreachable; showing the offline page");
    if let (Some(window), Some(url)) = (app.get_webview_window("main"), offline_url(web)) {
        let _ = window.navigate(url);
    }
}

async fn reachable(host: String, port: u16) -> bool {
    matches!(
        tokio::time::timeout(PROBE_TIMEOUT, tokio::net::TcpStream::connect((host, port))).await,
        Ok(Ok(_))
    )
}

pub fn recreate_main(app: &AppHandle) -> tauri::Result<()> {
    match INIT_SCRIPT.get() {
        Some(script) => open_main(app, &web_url(), script),
        None => Ok(()),
    }
}

pub fn open_main(app: &AppHandle, web: &str, init_script: &str) -> tauri::Result<()> {
    let _ = STARTED.set(Instant::now());
    let _ = INIT_SCRIPT.set(init_script.to_string());
    let address: Url = web
        .parse()
        .map_err(|_| tauri::Error::InvalidUrl(url::ParseError::RelativeUrlWithoutBase))?;
    let origin = address.origin();
    let watchdog = Arc::new(Watchdog::default());
    let hook_watchdog = Arc::clone(&watchdog);
    let hook_web = web.to_string();
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(address))
        .title("DoU")
        .initialization_script(init_script)
        .inner_size(1100.0, 760.0)
        .min_inner_size(420.0, 560.0)
        .on_page_load(move |webview, payload| {
            if payload.url().origin() != origin {
                return;
            }
            match payload.event() {
                PageLoadEvent::Started => {
                    let armed = hook_watchdog.arm();
                    let watchdog = Arc::clone(&hook_watchdog);
                    let app = webview.app_handle().clone();
                    let web = hook_web.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(LOAD_DEADLINE).await;
                        if watchdog.should_fall_back(armed) {
                            show_offline(&app, &web);
                        }
                    });
                }
                PageLoadEvent::Finished => {
                    hook_watchdog.finish();
                    #[cfg(debug_assertions)]
                    if let Some(started) = STARTED.get() {
                        eprintln!(
                            "main page loaded {} ms after launch",
                            started.elapsed().as_millis()
                        );
                    }
                }
            }
        })
        .build()?;

    if let Some((host, port)) = probe_target(web) {
        let app = app.clone();
        let web = web.to_string();
        tauri::async_runtime::spawn(async move {
            if !reachable(host, port).await && watchdog.unfinished() {
                show_offline(&app, &web);
            }
        });
    }
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
    fn the_offline_page_carries_the_web_url_encoded() {
        assert_eq!(
            offline_path("https://dou-dev.chatic.io"),
            "offline.html?to=https%3A%2F%2Fdou-dev.chatic.io"
        );
        let url = offline_url("https://x.test/").expect("url");
        assert!(
            url.as_str()
                .ends_with("/offline.html?to=https%3A%2F%2Fx.test%2F")
        );
    }

    #[test]
    fn the_probe_targets_the_host_and_the_scheme_port() {
        assert_eq!(
            probe_target("https://dou.chatic.io/a"),
            Some(("dou.chatic.io".to_string(), 443))
        );
        assert_eq!(
            probe_target("http://localhost:5004"),
            Some(("localhost".to_string(), 5004))
        );
        assert_eq!(probe_target("not a url"), None);
    }

    #[test]
    fn a_load_that_finished_or_was_superseded_does_not_fall_back() {
        let watchdog = Watchdog::default();
        let first = watchdog.arm();
        assert!(watchdog.unfinished());
        assert!(watchdog.should_fall_back(first));
        let second = watchdog.arm();
        assert!(!watchdog.should_fall_back(first));
        assert!(watchdog.should_fall_back(second));
        watchdog.finish();
        assert!(!watchdog.should_fall_back(second));
        assert!(!watchdog.unfinished());
    }
}
