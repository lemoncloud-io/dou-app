use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::agent::Agent;
use crate::agent::commands::{bridge_origin, current_state};

pub const EVENT: &str = "agent-state";
const TICK: Duration = Duration::from_secs(1);

pub fn changed(last: &mut Option<Value>, now: Value) -> Option<Value> {
    if last.as_ref() == Some(&now) {
        return None;
    }
    *last = Some(now.clone());
    Some(now)
}

fn agent_window_is_showing(app: &AppHandle) -> bool {
    app.get_webview_window("agent").is_some_and(|window| {
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
    })
}

pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut last: Option<Value> = None;
        loop {
            tokio::time::sleep(TICK).await;
            if !agent_window_is_showing(&app) {
                last = None;
                continue;
            }
            let Some(agent) = app.try_state::<Arc<Agent>>().map(|a| Arc::clone(&a)) else {
                continue;
            };
            let web_url = bridge_origin(&app);
            let Ok(value) =
                tauri::async_runtime::spawn_blocking(move || current_state(&agent, &web_url)).await
            else {
                continue;
            };
            if let Some(value) = changed(&mut last, value) {
                let _ = app.emit_to("agent", EVENT, value);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn only_a_different_state_is_pushed() {
        let mut last = None;
        assert_eq!(
            changed(&mut last, json!({ "a": 1 })),
            Some(json!({ "a": 1 }))
        );
        assert_eq!(changed(&mut last, json!({ "a": 1 })), None);
        assert_eq!(
            changed(&mut last, json!({ "a": 2 })),
            Some(json!({ "a": 2 }))
        );
    }
}
