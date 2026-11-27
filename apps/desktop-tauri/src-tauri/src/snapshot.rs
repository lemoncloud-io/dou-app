use tauri::{AppHandle, Manager};

pub fn main_window_png(app: &AppHandle) -> Result<Vec<u8>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("the main window is gone")?;
    capture::png_of(&window)
}
