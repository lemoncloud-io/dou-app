fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&["bridge_request"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("the Tauri build failed");
}
