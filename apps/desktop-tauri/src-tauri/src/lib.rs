mod window;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            window::open_main(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the Tauri application failed to run");
}
