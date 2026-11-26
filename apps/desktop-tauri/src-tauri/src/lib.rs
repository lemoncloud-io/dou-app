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
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![bridge::bridge_request])
        .setup(|app| {
            let web = window::web_url();
            let installed = bridge::install(app, &web)?;
            window::open_main(app.handle(), &web, &installed.init_script)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the Tauri application failed to run");
}
