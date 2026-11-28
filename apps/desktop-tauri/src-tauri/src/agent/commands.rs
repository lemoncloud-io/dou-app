use std::sync::Arc;

use serde_json::{Value, json};
use tauri::{AppHandle, Manager, State, Webview};

use super::Agent;
use crate::mcp_pipe::{call_tool, request};
use crate::sidecar::{Pairing, Status};

type Shared<'a> = State<'a, Arc<Agent>>;

const CHOOSE_CLOUD: &str =
    "dou-cli enters the cloud its pairing was approved for; choosing another is not supported yet.";
const UNTRUSTED_OPEN: &str = "<untrusted-message-content>\n";
const UNTRUSTED_CLOSE: &str = "\n</untrusted-message-content>";

pub(super) fn from_agent_window(webview: &Webview) -> Result<(), String> {
    if webview.label() == "agent" {
        Ok(())
    } else {
        Err("only the agent window may call this".to_string())
    }
}

fn pairing_value(pairing: &Pairing) -> Value {
    match pairing {
        Pairing::Idle => json!({ "kind": "idle" }),
        Pairing::Starting => json!({ "kind": "starting" }),
        Pairing::Waiting { code } => json!({ "kind": "waiting", "code": code }),
        Pairing::Applying => json!({ "kind": "applying" }),
        Pairing::Failed { message } => json!({ "kind": "failed", "message": message }),
    }
}

pub fn state_value(
    web_url: &str,
    pairing: &Pairing,
    sidecar: Option<&Status>,
    status: &Result<Value, String>,
) -> Value {
    let signed_in = status
        .as_ref()
        .is_ok_and(|status| status["signedIn"] == true);
    let cloud = status.as_ref().ok().and_then(|status| {
        status["activeServer"]["cloudId"]
            .as_str()
            .map(str::to_string)
    });
    let engine = match (status, sidecar) {
        (Ok(status), _) if signed_in => json!({
            "kind": "running",
            "me": status["userId"],
            "cloud": cloud,
        }),
        (Ok(_), _) => json!({ "kind": "stopped" }),
        (Err(_), Some(Status::Failed(message))) => json!({ "kind": "failed", "message": message }),
        (Err(_), Some(Status::Starting | Status::Running)) => {
            json!({ "kind": "starting", "cloud": null })
        }
        (Err(_), _) => json!({ "kind": "stopped" }),
    };
    json!({
        "signedIn": signed_in,
        "cloud": cloud,
        "engine": engine,
        "pairing": pairing_value(pairing),
        "webUrl": web_url,
        "connected": status.is_ok(),
    })
}

pub fn unwrap_untrusted(text: &str) -> &str {
    text.strip_prefix(UNTRUSTED_OPEN)
        .and_then(|rest| rest.strip_suffix(UNTRUSTED_CLOSE))
        .unwrap_or(text)
}

pub fn rooms_value(body: &Value) -> Value {
    let rooms = body["list"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    Value::Array(
        rooms
            .iter()
            .map(|room| {
                let title = room["title"]
                    .as_str()
                    .map(unwrap_untrusted)
                    .unwrap_or_default();
                json!({ "id": room["id"], "title": title })
            })
            .collect(),
    )
}

pub fn clouds_value(result: &Value) -> Value {
    let clouds = result["clouds"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    Value::Array(
        clouds
            .iter()
            .map(|cloud| json!({ "id": cloud["cloudId"], "name": cloud["name"] }))
            .collect(),
    )
}

pub fn bridge_origin(app: &AppHandle) -> String {
    app.try_state::<crate::bridge::Bridge>()
        .map(|b| b.origin.clone())
        .unwrap_or_default()
}

pub fn current_state(agent: &Agent, web_url: &str) -> Value {
    let status = request(agent.paths(), "dou/status", json!({}));
    let sidecar = agent.sidecar().map(|sidecar| sidecar.status());
    state_value(web_url, &agent.pairing(), sidecar.as_ref(), &status)
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_state(
    webview: Webview,
    app: AppHandle,
    agent: Shared<'_>,
) -> Result<Value, String> {
    from_agent_window(&webview)?;
    let web_url = bridge_origin(&app);
    let agent = Arc::clone(&agent);
    blocking(move || Ok(current_state(&agent, &web_url))).await
}

#[tauri::command]
pub fn agent_pair_start(webview: Webview, agent: Shared<'_>) -> Result<(), String> {
    from_agent_window(&webview)?;
    agent.start_pairing()
}

#[tauri::command]
pub async fn agent_clouds(webview: Webview, agent: Shared<'_>) -> Result<Value, String> {
    from_agent_window(&webview)?;
    let agent = Arc::clone(&agent);
    blocking(move || request(agent.paths(), "dou/clouds", json!({})).map(|r| clouds_value(&r)))
        .await
}

#[tauri::command]
pub fn agent_choose_cloud(webview: Webview, cloud: String) -> Result<bool, String> {
    from_agent_window(&webview)?;
    let _ = cloud;
    Err(CHOOSE_CLOUD.to_string())
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
pub async fn agent_rooms(webview: Webview, agent: Shared<'_>) -> Result<Value, String> {
    from_agent_window(&webview)?;
    let agent = Arc::clone(&agent);
    blocking(move || {
        call_tool(agent.paths(), "rooms_list", json!({})).map(|body| rooms_value(&body))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(signed_in: bool) -> Result<Value, String> {
        Ok(
            json!({ "signedIn": signed_in, "userId": "u1", "activeServer": { "kind": "cloud", "cloudId": "c9" } }),
        )
    }

    #[test]
    fn a_signed_in_node_is_running_in_its_cloud() {
        let value = state_value(
            "https://x.test",
            &Pairing::Idle,
            Some(&Status::Running),
            &status(true),
        );
        assert_eq!(value["signedIn"], true);
        assert_eq!(
            value["engine"],
            json!({ "kind": "running", "me": "u1", "cloud": "c9" })
        );
        assert_eq!(value["connected"], true);
        assert_eq!(value["webUrl"], "https://x.test");
    }

    #[test]
    fn a_signed_out_node_is_stopped_and_a_missing_socket_follows_the_sidecar() {
        let out = state_value("", &Pairing::Idle, Some(&Status::Running), &status(false));
        assert_eq!(out["engine"]["kind"], "stopped");
        let none: Result<Value, String> = Err("no socket".to_string());
        let starting = state_value("", &Pairing::Idle, Some(&Status::Starting), &none);
        assert_eq!(starting["engine"]["kind"], "starting");
        assert_eq!(starting["connected"], false);
        let failed = state_value(
            "",
            &Pairing::Idle,
            Some(&Status::Failed("boom".into())),
            &none,
        );
        assert_eq!(
            failed["engine"],
            json!({ "kind": "failed", "message": "boom" })
        );
        assert_eq!(
            state_value("", &Pairing::Idle, None, &none)["engine"]["kind"],
            "stopped"
        );
        assert_eq!(
            state_value("", &Pairing::Idle, Some(&Status::Paused), &none)["engine"]["kind"],
            "stopped"
        );
    }

    #[test]
    fn pairing_states_carry_the_code_and_the_failure() {
        let waiting = state_value(
            "",
            &Pairing::Waiting {
                code: "AB-12".into(),
            },
            None,
            &status(false),
        );
        assert_eq!(
            waiting["pairing"],
            json!({ "kind": "waiting", "code": "AB-12" })
        );
        let failed = state_value(
            "",
            &Pairing::Failed {
                message: "denied".into(),
            },
            None,
            &status(false),
        );
        assert_eq!(
            failed["pairing"],
            json!({ "kind": "failed", "message": "denied" })
        );
        assert_eq!(pairing_value(&Pairing::Applying)["kind"], "applying");
    }

    #[test]
    fn rooms_lose_the_untrusted_envelope_and_clouds_get_the_ids_the_window_reads() {
        let rooms = rooms_value(
            &json!({ "list": [{ "id": "r1", "title": "<untrusted-message-content>\nGeneral\n</untrusted-message-content>" }] }),
        );
        assert_eq!(rooms, json!([{ "id": "r1", "title": "General" }]));
        let clouds = clouds_value(
            &json!({ "active": "c9", "clouds": [{ "cloudId": "c9", "name": "Nine" }] }),
        );
        assert_eq!(clouds, json!([{ "id": "c9", "name": "Nine" }]));
    }

    #[test]
    fn the_settings_file_is_the_profile_settings_json() {
        let agent = Agent::new(crate::profile::Paths::new("/p"), None, None);
        assert_eq!(
            settings_file(&agent),
            std::path::Path::new("/p/settings.json")
        );
    }

    #[test]
    fn pairing_without_a_sidecar_says_why() {
        let agent = Agent::new(crate::profile::Paths::new("/p"), None, None);
        assert!(
            agent
                .start_pairing()
                .expect_err("no sidecar")
                .contains("sidecar")
        );
    }
}
