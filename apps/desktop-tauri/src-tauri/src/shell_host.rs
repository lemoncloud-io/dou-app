use std::path::PathBuf;
use std::sync::Arc;

use serde_json::{Value, json};
use tauri::{AppHandle, Manager};

use crate::app_source::{AppConfig, AppSource};
use crate::logs;
use crate::profile::{Paths, is_deep_link};
use crate::shell_sock::Host;

pub struct Running {
    pub paths: Paths,
    pub source: AppSource,
    pub web_url: String,
}

pub struct ShellHost {
    pub app: AppHandle,
}

pub fn relaunch_args(current: &[String], app: Option<&str>) -> Vec<String> {
    let mut out = Vec::new();
    let mut at = 0;
    while at < current.len() {
        let arg = &current[at];
        if arg == "--app" {
            at += 2;
        } else if arg.starts_with("--app=") {
            at += 1;
        } else {
            out.push(arg.clone());
            at += 1;
        }
    }
    if let Some(app) = app {
        out.push("--app".to_string());
        out.push(app.to_string());
    }
    out
}

fn relaunch(app: &AppHandle, new_app: Option<&str>) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let current: Vec<String> = std::env::args().skip(1).collect();
    std::process::Command::new(exe)
        .args(relaunch_args(&current, new_app))
        .env(crate::RESTART_ENV, "1")
        .spawn()
        .map_err(|e| e.to_string())?;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(300));
        handle.exit(0);
    });
    Ok(())
}

fn running(app: &AppHandle) -> Result<Arc<Running>, String> {
    app.try_state::<Arc<Running>>()
        .map(|s| Arc::clone(&s))
        .ok_or_else(|| "the shell is not ready".to_string())
}

impl Host for ShellHost {
    fn reload(&self) -> Result<(), String> {
        let window = self
            .app
            .get_webview_window("main")
            .ok_or("the main window is gone")?;
        window.eval("location.reload()").map_err(|e| e.to_string())
    }

    fn app_source(&self) -> Value {
        match running(&self.app) {
            Ok(r) => json!({
                "source": r.source.describe(),
                "kind": match r.source {
                    AppSource::Default => "default",
                    AppSource::Url(_) => "url",
                    AppSource::Folder(_) => "folder",
                },
                "url": r.web_url,
            }),
            Err(_) => Value::Null,
        }
    }

    fn set_app_source(&self, text: &str) -> Result<Value, String> {
        let running = running(&self.app)?;
        let wanted = text.trim();
        let (source, saved) = if wanted.is_empty() || wanted == "default" {
            (AppSource::Default, None)
        } else {
            (AppSource::parse(wanted)?, Some(wanted.to_string()))
        };
        let path = running.paths.app_json();
        let mut config = AppConfig::load(&path);
        config.app = match &source {
            AppSource::Folder(folder) => Some(folder.display().to_string()),
            _ => saved.clone(),
        };
        config.save(&path).map_err(|e| e.to_string())?;
        relaunch(&self.app, config.app.as_deref())?;
        Ok(json!({ "restarting": true, "source": source.describe() }))
    }

    fn screenshot(&self) -> Result<Vec<u8>, String> {
        crate::snapshot::main_window_png(&self.app)
    }

    fn logs_tail(&self, file: &str, lines: usize) -> Result<Vec<String>, String> {
        let dir: PathBuf = running(&self.app)?.paths.logs_dir();
        logs::tail(&dir, file, lines)
    }

    fn focus(&self) {
        if let Some(window) = self.app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }

    fn second_instance(&self, argv: Vec<String>) {
        self.focus();
        let links: Vec<url::Url> = argv
            .iter()
            .filter(|arg| is_deep_link(arg))
            .filter_map(|arg| url::Url::parse(arg).ok())
            .collect();
        if !links.is_empty() {
            crate::handlers::deliver_links(&self.app, links);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn a_relaunch_swaps_the_app_flag_and_keeps_the_rest() {
        let args = relaunch_args(
            &list(&["--profile", "/p", "--app", "/old", "chatic://x"]),
            Some("/new"),
        );
        assert_eq!(
            args,
            list(&["--profile", "/p", "chatic://x", "--app", "/new"])
        );
        let none = relaunch_args(&list(&["--app=/old", "--profile", "/p"]), None);
        assert_eq!(none, list(&["--profile", "/p"]));
    }
}
