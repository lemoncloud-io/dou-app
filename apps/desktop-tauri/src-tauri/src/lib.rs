mod agent;
mod agent_push;
mod bridge;
#[cfg(test)]
mod command_drift_tests;
mod globals;
pub mod handlers;
mod shell_ui;
mod window;

fn updater_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry, tauri_plugin_updater::Config> {
    let builder = tauri_plugin_updater::Builder::new();
    match handlers::update_pubkey() {
        Some(key) => builder.pubkey(key),
        None => builder,
    }
    .build()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(shell_ui::shortcut_plugin())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(updater_plugin())
        .invoke_handler(tauri::generate_handler![
            bridge::bridge_request,
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
        .setup(|app| {
            let web = window::web_url();
            let installed = bridge::install(app, &web)?;
            agent::autostart(app, &installed.stage)?;
            handlers::listen_for_sign_in(app.handle());
            window::open_main(app.handle(), &web, &installed.init_script)?;
            window::install_menu(app.handle())?;
            agent_push::start(app.handle());
            shell_ui::install(app.handle())?;
            if std::env::var_os("DOU_OPEN_AGENT").is_some() {
                window::open_agent(app.handle())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the Tauri application failed to run");
}
