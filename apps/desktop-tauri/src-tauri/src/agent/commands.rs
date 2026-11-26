use std::sync::Arc;

use serde_json::{Value, json};
use tauri::{AppHandle, Manager, State, Webview};

use super::host::{Agent, Engine, Pairing};

type Shared<'a> = State<'a, Arc<Agent>>;

pub(super) fn from_agent_window(webview: &Webview) -> Result<(), String> {
    if webview.label() == "agent" {
        Ok(())
    } else {
        Err("only the agent window may call this".to_string())
    }
}

pub fn state_value(agent: &Agent, web_url: &str) -> Value {
    let engine = match agent.engine() {
        Engine::Stopped => json!({ "kind": "stopped" }),
        Engine::Starting { cloud } => json!({ "kind": "starting", "cloud": cloud }),
        Engine::Running { cloud, me } => json!({ "kind": "running", "cloud": cloud, "me": me }),
        Engine::Failed { message } => json!({ "kind": "failed", "message": message }),
    };
    let pairing = match agent.pairing() {
        Pairing::Idle => json!({ "kind": "idle" }),
        Pairing::Starting => json!({ "kind": "starting" }),
        Pairing::Waiting { code } => json!({ "kind": "waiting", "code": code }),
        Pairing::Applying => json!({ "kind": "applying" }),
        Pairing::Failed { message } => json!({ "kind": "failed", "message": message }),
    };
    json!({
        "signedIn": agent.signed_in(),
        "cloud": agent.chosen_cloud(),
        "engine": engine,
        "pairing": pairing,
        "webUrl": web_url,
    })
}

#[tauri::command]
pub fn agent_state(webview: Webview, agent: Shared<'_>) -> Result<Value, String> {
    from_agent_window(&webview)?;
    Ok(state_value(&agent, &crate::window::web_url()))
}

#[tauri::command]
pub fn agent_pair_start(webview: Webview, agent: Shared<'_>) -> Result<(), String> {
    from_agent_window(&webview)?;
    agent.inner().start_pairing()
}

#[tauri::command]
pub async fn agent_clouds(webview: Webview, agent: Shared<'_>) -> Result<Value, String> {
    from_agent_window(&webview)?;
    agent.clouds().await
}

#[tauri::command]
pub fn agent_choose_cloud(
    webview: Webview,
    agent: Shared<'_>,
    cloud: String,
) -> Result<(), String> {
    from_agent_window(&webview)?;
    if cloud.is_empty()
        || cloud.len() > 64
        || !cloud
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("That is not a cloud id.".to_string());
    }
    if let Engine::Running { cloud: current, .. } | Engine::Starting { cloud: current } =
        agent.engine()
        && current != cloud
    {
        return Err("The engine is running another cloud. Restart the app to switch.".to_string());
    }
    agent.choose_cloud(&cloud)?;
    agent.inner().autostart_engine();
    Ok(())
}

#[tauri::command]
pub fn agent_open_approve_page(webview: Webview, app: AppHandle) -> Result<(), String> {
    from_agent_window(&webview)?;
    let main = app
        .get_webview_window("main")
        .ok_or("the main window is gone")?;
    let origin = crate::bridge::origin_of(main.url().map_err(|e| e.to_string())?.as_str())
        .ok_or("the main window has no web address")?;
    let origin = serde_json::Value::String(origin);
    main.eval(format!(
        "if (location.origin === {origin}) {{ history.pushState({{}}, '', '/mypage/pairing/approve'); \
         window.dispatchEvent(new PopStateEvent('popstate')); }}"
    ))
    .map_err(|e| e.to_string())?;
    main.show().map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())
}

fn settings_file(agent: &Agent) -> std::path::PathBuf {
    dou_app::settings_path(agent.profile_dir())
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
pub async fn agent_rooms(webview: Webview, agent: Shared<'_>) -> Result<Value, String> {
    from_agent_window(&webview)?;
    let rooms = agent.owner_call("rooms", json!({})).await?;
    let list: Vec<Value> = rooms["list"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|room| json!({ "id": room["id"], "title": room["title"] }))
                .collect()
        })
        .unwrap_or_default();
    Ok(json!(list))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_state_of_a_new_agent_says_signed_out_and_stopped() {
        let dir = tempfile::tempdir().expect("temp dir");
        let agent = Agent::new(dir.path().join("agent"), "dev");
        let value = state_value(&agent, "https://dou-dev.chatic.io");
        assert_eq!(value["signedIn"], false);
        assert_eq!(value["engine"]["kind"], "stopped");
        assert_eq!(value["pairing"]["kind"], "idle");
        assert_eq!(value["webUrl"], "https://dou-dev.chatic.io");
    }
}
