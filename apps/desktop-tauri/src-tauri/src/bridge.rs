use std::path::Path;
use std::sync::Arc;

use bridge_host::{BRIDGE_VERSION, BridgeHost, Config};
use tauri::ipc::CapabilityBuilder;
use tauri::{App, AppHandle, Manager, State, Webview};
use url::Url;

use crate::globals::{ShellInfo, init_script, language_subtag};
use crate::profile::Paths;

pub struct Bridge {
    host: Arc<BridgeHost>,
    pub(crate) origin: String,
}

pub fn origin_of(address: &str) -> Option<String> {
    let parsed = Url::parse(address).ok()?;
    if parsed.scheme() != "https" && parsed.host_str() != Some("localhost") {
        return None;
    }
    Some(parsed.origin().ascii_serialization())
}

fn device_id(path: &Path) -> String {
    if let Ok(text) = std::fs::read_to_string(path) {
        let text = text.trim();
        if !text.is_empty() {
            return text.to_string();
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(path, &id);
    id
}

pub fn push_event(app: &AppHandle, event_type: &str, data: serde_json::Value) {
    if let Some(bridge) = app.try_state::<Bridge>() {
        bridge.host.push_event(event_type, data);
    }
}

fn push_to_web(app: &AppHandle, origin: &str, message: &str) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let literal = serde_json::Value::String(message.to_string());
    let guard = serde_json::Value::String(origin.to_string());
    let script = format!(
        "if (location.origin === {guard}) window.dispatchEvent(new MessageEvent('message', {{ data: {literal} }}));"
    );
    let _ = window.eval(script);
}

pub struct Installed {
    pub init_script: String,
}

pub fn install(
    app: &mut App,
    web_url: &str,
    paths: &Paths,
    key_account: &str,
) -> Result<Installed, String> {
    let origin =
        origin_of(web_url).ok_or_else(|| format!("not a usable web address: {web_url}"))?;
    let stage = option_env!("DOU_STAGE")
        .unwrap_or(if cfg!(debug_assertions) {
            "dev"
        } else {
            "prod"
        })
        .to_string();
    let info = ShellInfo {
        device_id: device_id(&paths.device_id()),
        stage: stage.clone(),
        version: app.package_info().version.to_string(),
        language: language_subtag(sys_locale::get_locale().as_deref()),
        model: std::env::consts::OS.to_string(),
    };
    let script = init_script(&info, &origin);

    let handle = app.handle().clone();
    let reply_origin = origin.clone();
    let mut host = BridgeHost::new(Config {
        version: BRIDGE_VERSION.to_string(),
        send_to_web: Arc::new(move |message| push_to_web(&handle, &reply_origin, &message)),
        sub_webview_open_scope: Some("anyHttps".to_string()),
        sub_webview_context: None,
        max_message_length: None,
    });

    let keys: Box<dyn vault::KeySource> =
        if cfg!(debug_assertions) && std::env::var_os("DOU_VAULT_KEY_FILE").is_some() {
            Box::new(vault::FileKeys::new(paths.vault_key()))
        } else {
            Box::new(vault::KeyringKeys::new(
                &app.config().identifier,
                key_account,
            ))
        };
    let vault = Arc::new(vault::Vault::open(paths.secrets(), keys));
    crate::handlers::register_all(
        &mut host,
        &crate::handlers::Context {
            app: app.handle().clone(),
            vault,
            stage: stage.clone(),
        },
    );

    app.add_capability(
        CapabilityBuilder::new("web-bridge")
            .remote(format!("{origin}/*"))
            .window("main")
            .permission("allow-bridge-request")
            .permission("allow-log-event"),
    )
    .map_err(|e| e.to_string())?;

    app.manage(Bridge {
        host: Arc::new(host),
        origin,
    });
    Ok(Installed {
        init_script: script,
    })
}

#[tauri::command]
pub async fn bridge_request(
    webview: Webview,
    bridge: State<'_, Bridge>,
    message: String,
) -> Result<(), String> {
    let url = webview.url().map_err(|e| e.to_string())?;
    if url.origin().ascii_serialization() != bridge.origin {
        return Err("the caller is not the web".to_string());
    }
    #[cfg(debug_assertions)]
    crate::logs::shell(&format!("bridge <- {}", request_type_of(&message)));
    bridge.host.handle_message(&message).await;
    Ok(())
}

#[tauri::command]
pub fn log_event(
    webview: Webview,
    bridge: State<'_, Bridge>,
    logs: State<'_, Arc<crate::logs::Logs>>,
    level: String,
    message: String,
) -> Result<(), String> {
    let url = webview.url().map_err(|e| e.to_string())?;
    if url.origin().ascii_serialization() != bridge.origin {
        return Err("the caller is not the web".to_string());
    }
    logs.webview_event(&level, &message);
    Ok(())
}

#[cfg(debug_assertions)]
fn request_type_of(message: &str) -> String {
    serde_json::from_str::<serde_json::Value>(message)
        .ok()
        .and_then(|v| v.get("type").and_then(|t| t.as_str().map(str::to_string)))
        .unwrap_or_else(|| "?".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_origin_is_scheme_host_and_port_without_a_path() {
        assert_eq!(
            origin_of("https://dou-dev.chatic.io/some/path?q=1").as_deref(),
            Some("https://dou-dev.chatic.io")
        );
        assert_eq!(
            origin_of("https://example.test:8443/").as_deref(),
            Some("https://example.test:8443")
        );
    }

    #[test]
    fn plain_http_is_refused_except_for_localhost() {
        assert_eq!(origin_of("http://dou-dev.chatic.io"), None);
        assert_eq!(
            origin_of("http://localhost:5004/").as_deref(),
            Some("http://localhost:5004")
        );
        assert_eq!(origin_of("not a url"), None);
    }
}
