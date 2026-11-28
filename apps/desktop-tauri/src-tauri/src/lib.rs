mod agent;
mod agent_push;
mod app_source;
mod bridge;
#[cfg(test)]
mod command_drift_tests;
mod globals;
pub mod handlers;
mod logs;
pub mod mcp_pipe;
pub mod profile;
pub mod shell_client;
mod shell_host;
mod shell_sock;
mod shell_ui;
pub mod sidecar;
mod snapshot;
mod window;

use std::sync::Arc;
use std::time::Duration;

use tauri::Manager;

use crate::app_source::{AppConfig, AppSource};
use crate::profile::{Cli, Lock, LockError, Paths};

pub const RESTART_ENV: &str = "DOU_SHELL_RESTART";

fn updater_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry, tauri_plugin_updater::Config> {
    let builder = tauri_plugin_updater::Builder::new();
    match handlers::update_pubkey() {
        Some(key) => builder.pubkey(key),
        None => builder,
    }
    .build()
}

fn stop(message: &str) -> ! {
    eprintln!("{message}");
    std::process::exit(2)
}

fn vault_account(custom: bool, paths: &Paths) -> String {
    if custom {
        let id = paths.store_identifier();
        format!(
            "vault-key-{}",
            id.iter().map(|b| format!("{b:02x}")).collect::<String>()
        )
    } else {
        "vault-key".to_string()
    }
}

fn hand_over(paths: &Paths, cli: &Cli) -> ! {
    let argv: Vec<String> = cli.deep_links.clone();
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    let outcome = loop {
        let reply = shell_client::call(
            paths,
            "second_instance",
            serde_json::json!({ "argv": argv }),
        );
        match reply {
            Err(_) if std::time::Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(200));
            }
            other => break other,
        }
    };
    match outcome {
        Ok(_) => std::process::exit(0),
        Err(error) => stop(&format!(
            "another DoU shell already runs on {}: {error}",
            paths.root().display()
        )),
    }
}

pub fn run() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cli = profile::parse_args(&args).unwrap_or_else(|e| stop(&e));
    let custom_profile = cli.profile.is_some();
    let restarting = std::env::var_os(RESTART_ENV).is_some();

    tauri::Builder::default()
        .on_page_load(|webview, payload| {
            if webview.label() != "main" {
                return;
            }
            match payload.event() {
                tauri::webview::PageLoadEvent::Started => {
                    handlers::reset_for_new_host(webview.app_handle());
                }
                tauri::webview::PageLoadEvent::Finished => {
                    handlers::open_pending_mini(webview.app_handle(), payload.url());
                }
            }
        })
        .plugin(tauri_plugin_deep_link::init())
        .plugin(shell_ui::shortcut_plugin())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(updater_plugin())
        .invoke_handler(tauri::generate_handler![
            bridge::bridge_request,
            bridge::log_event,
            handlers::subview::sub_bridge_request,
            handlers::subview::sub_close_request,
            agent::commands::agent_state,
            agent::commands::agent_pair_start,
            agent::commands::agent_clouds,
            agent::commands::agent_choose_cloud,
            agent::commands::agent_open_approve_page,
            agent::commands::agent_settings_get,
            agent::commands::agent_settings_set,
            agent::commands::agent_rooms,
            agent::connect::agent_connectors,
            agent::connect::agent_connect,
            agent::connect::agent_disconnect
        ])
        .setup(move |app| {
            let root = match &cli.profile {
                Some(dir) => dir.clone(),
                None => app.path().app_data_dir().map_err(|e| e.to_string())?,
            };
            let paths = Paths::prepare(&root).map_err(|e| format!("profile folder: {e}"))?;
            let lock = if restarting {
                Lock::acquire_within(&paths, Duration::from_secs(10))
            } else {
                Lock::acquire(&paths)
            };
            let lock = match lock {
                Ok(lock) => lock,
                Err(LockError::Held) => hand_over(&paths, &cli),
                Err(LockError::Io(e)) => stop(&format!("profile lock: {e}")),
            };
            app.manage(lock);

            logs::install_shell(&paths.logs_dir());
            app.manage(Arc::new(logs::Logs::open(&paths.logs_dir())));
            logs::shell(&format!("shell start, profile {}", paths.root().display()));

            let config_path = paths.app_json();
            let mut config = AppConfig::load(&config_path);
            if let Some(wanted) = &cli.app {
                let source = AppSource::parse_main(wanted).map_err(|e| e.to_string())?;
                config.app = Some(match &source {
                    AppSource::Folder(folder) => folder.display().to_string(),
                    _ => wanted.clone(),
                });
            }
            let resolved = app_source::resolve_source(
                AppSource::from_config(&config),
                &window::web_url(),
                config.port,
            )?;
            if resolved.port.is_some() && resolved.port != config.port {
                config.port = resolved.port;
            }
            if let Some(wanted) = &cli.mini_app {
                if wanted == "none" {
                    config.mini_app = None;
                    config.mini_port = None;
                } else {
                    let source = AppSource::parse(wanted).map_err(|e| e.to_string())?;
                    config.mini_app = Some(match &source {
                        AppSource::Folder(folder) => folder.display().to_string(),
                        _ => wanted.clone(),
                    });
                }
            }
            if cli.app.is_some() || cli.mini_app.is_some() || config.port.is_some() {
                let _ = config.save(&config_path);
            }
            logs::shell(&format!("web {}", resolved.web_url));
            app.manage(handlers::PendingMini::new(
                config.mini_app.clone(),
                config.mini_port,
                config_path.clone(),
            ));

            let installed = bridge::install(
                app,
                &resolved.web_url,
                &paths,
                &vault_account(custom_profile, &paths),
            )?;
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(std::path::Path::to_path_buf));
            let env = |name: &str| {
                cfg!(debug_assertions)
                    .then(|| std::env::var(name).ok())
                    .flatten()
            };
            let locate = |command: &str| {
                exe_dir
                    .as_deref()
                    .and_then(|dir| sidecar::locate(&paths, dir, &env, command))
            };
            let node_sink = Arc::new(logs::Sink::new(
                paths.logs_dir().join("node.log"),
                logs::MAX_BYTES,
                logs::KEEP,
            ));
            let node =
                locate("serve").map(|spec| Arc::new(sidecar::Sidecar::start(spec, node_sink)));
            if node.is_none() {
                logs::shell("dou-cli sidecar not found; MCP and the engine are off");
            }
            app.manage(Arc::new(agent::Agent::new(
                paths.clone(),
                node,
                locate("pair"),
            )));
            handlers::listen_for_sign_in(app.handle());
            window::open_main(
                app.handle(),
                &resolved.web_url,
                &installed.init_script,
                custom_profile.then_some(&paths),
            )?;
            window::install_menu(app.handle())?;
            agent_push::start(app.handle());
            shell_ui::install(app.handle())?;
            if std::env::var_os("DOU_OPEN_AGENT").is_some() {
                window::open_agent(app.handle())?;
            }

            let host = Arc::new(shell_host::ShellHost {
                app: app.handle().clone(),
            });
            app.manage(Arc::new(shell_host::Running {
                paths: paths.clone(),
                source: resolved.source,
                web_url: resolved.web_url,
            }));
            shell_sock::start(&paths, host).map_err(|e| format!("shell.sock: {e}"))?;
            let links: Vec<url::Url> = cli
                .deep_links
                .iter()
                .filter_map(|link| url::Url::parse(link).ok())
                .collect();
            if !links.is_empty() {
                handlers::deliver_links(app.handle(), links);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("the Tauri application failed to build")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit)
                && let Some(agent) = app.try_state::<Arc<agent::Agent>>()
            {
                agent.shutdown();
            }
        });
}
