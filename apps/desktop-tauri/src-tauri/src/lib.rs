mod bridge;
mod globals;
pub mod handlers;
mod window;

pub fn run() {
    tauri::Builder::default()
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
