use std::sync::Arc;

use serde_json::{Value, json};
use tauri::{AppHandle, Manager, State, Webview};

use super::Agent;

type Shared<'a> = State<'a, Arc<Agent>>;

const NOT_CONNECTED: &str = "The engine is not connected in this build; dou-cli provides it.";

pub(super) fn from_agent_window(webview: &Webview) -> Result<(), String> {
    if webview.label() == "agent" {
        Ok(())
    } else {
        Err("only the agent window may call this".to_string())
    }
}

pub fn state_value(web_url: &str) -> Value {
    json!({
        "signedIn": false,
        "cloud": null,
        "engine": { "kind": "stopped" },
        "pairing": { "kind": "idle" },
        "webUrl": web_url,
        "connected": false,
    })
}

#[tauri::command]
pub fn agent_state(webview: Webview, app: AppHandle) -> Result<Value, String> {
    from_agent_window(&webview)?;
    let web_url = app
        .try_state::<crate::bridge::Bridge>()
        .map(|b| b.origin.clone())
        .unwrap_or_default();
    Ok(state_value(&web_url))
}

#[tauri::command]
pub fn agent_pair_start(webview: Webview) -> Result<(), String> {
    from_agent_window(&webview)?;
    Err(NOT_CONNECTED.to_string())
}

#[tauri::command]
pub async fn agent_clouds(webview: Webview) -> Result<Value, String> {
    from_agent_window(&webview)?;
    Err(NOT_CONNECTED.to_string())
}

#[tauri::command]
pub fn agent_choose_cloud(webview: Webview, cloud: String) -> Result<bool, String> {
    from_agent_window(&webview)?;
    let _ = cloud;
    Err(NOT_CONNECTED.to_string())
}

#[tauri::command]
pub fn agent_open_approve_page(webview: Webview, app: AppHandle) -> Result<(), String> {
    from_agent_window(&webview)?;
    let main = app
        .get_webview_window("main")
        .ok_or("the main window is gone")?;
    let origin = serde_json::Value::String(app.state::<crate::bridge::Bridge>().origin.clone());
    main.eval(format!(
        "if (location.origin === {origin}) {{ history.pushState({{}}, '', '/mypage/pairing/approve'); \
         window.dispatchEvent(new PopStateEvent('popstate')); }}"
    ))
    .map_err(|e| e.to_string())?;
    main.show().map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())
}

fn settings_file(agent: &Agent) -> std::path::PathBuf {
    agent.profile_dir().join("settings.json")
}

#[tauri::command]
pub fn agent_settings_get(webview: Webview, agent: Shared<'_>) -> Result<Value, String> {
    from_agent_window(&webview)?;
    Ok(agent_settings::to_value(&agent_settings::load(
        &settings_file(&agent),
    )))
}

#[tauri::command]
pub fn agent_settings_set(
    webview: Webview,
    agent: Shared<'_>,
    settings: Value,
) -> Result<Value, String> {
    from_agent_window(&webview)?;
    let saved = agent_settings::save(&settings_file(&agent), &settings)?;
    Ok(agent_settings::to_value(&saved))
}

#[tauri::command]
pub async fn agent_rooms(webview: Webview) -> Result<Value, String> {
    from_agent_window(&webview)?;
    Ok(json!([]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_state_says_signed_out_stopped_and_not_connected() {
        let value = state_value("https://dou-dev.chatic.io");
        assert_eq!(value["signedIn"], false);
        assert_eq!(value["engine"]["kind"], "stopped");
        assert_eq!(value["pairing"]["kind"], "idle");
        assert_eq!(value["connected"], false);
        assert_eq!(value["webUrl"], "https://dou-dev.chatic.io");
    }

    #[test]
    fn the_settings_file_is_the_profile_settings_json() {
        let agent = Agent::new("/p".into());
        assert_eq!(settings_file(&agent), std::path::Path::new("/p/settings.json"));
    }
}
