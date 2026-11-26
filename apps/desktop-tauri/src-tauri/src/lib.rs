mod agent;
mod bridge;
mod globals;
pub mod handlers;
mod window;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
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
            window::open_main(app.handle(), &web, &installed.init_script)?;
            window::install_menu(app.handle())?;
            if std::env::var_os("DOU_OPEN_AGENT").is_some() {
                window::open_agent(app.handle())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the Tauri application failed to run");
}
