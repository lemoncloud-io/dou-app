fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "bridge_request",
        "log_event",
        "sub_bridge_request",
        "sub_close_request",
        "agent_state",
        "agent_pair_start",
        "agent_clouds",
        "agent_choose_cloud",
        "agent_open_approve_page",
        "agent_settings_get",
        "agent_settings_set",
        "agent_rooms",
        "agent_connectors",
        "agent_connect",
        "agent_disconnect",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("the Tauri build failed");
}
