#[cfg(any(windows, test))]
use base64::Engine as _;
use bridge_host::BridgeHost;
use serde_json::{Value, json};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use super::{Context, sync};

pub fn save_preference(message: &Value) -> Value {
    json!({
        "type": "OnSavePreference",
        "success": true,
        "data": { "key": message["data"]["key"], "success": true },
    })
}

pub fn fcm_token() -> Value {
    json!({ "type": "OnFetchFcmToken", "success": true, "data": { "token": "" } })
}

const URL_MAX: usize = 2048;

pub fn web_url_of(message: &Value) -> Option<Url> {
    let text = message["data"]["url"]
        .as_str()
        .filter(|text| text.len() <= URL_MAX)?;
    let url = Url::parse(text).ok()?;
    matches!(url.scheme(), "http" | "https").then_some(url)
}

#[cfg(any(windows, test))]
pub fn png_from_data_url(data_url: &str) -> Option<Vec<u8>> {
    let body = data_url.strip_prefix("data:image/png;base64,")?;
    base64::engine::general_purpose::STANDARD.decode(body).ok()
}

#[cfg(windows)]
fn set_badge(app: &AppHandle, count: i64, overlay: Option<&str>) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    let image = overlay
        .and_then(png_from_data_url)
        .and_then(|png| tauri::image::Image::from_bytes(&png).ok());
    window
        .set_overlay_icon(if count > 0 { image } else { None })
        .is_ok()
}

#[cfg(not(windows))]
fn set_badge(app: &AppHandle, count: i64, _overlay: Option<&str>) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    window
        .set_badge_count(if count > 0 { Some(count) } else { None })
        .is_ok()
}

pub fn register(host: &mut BridgeHost, context: &Context) {
    host.register("SavePreference", sync(|message| save_preference(&message)));
    host.register("FetchFcmToken", sync(|_| fcm_token()));

    let app = context.app.clone();
    host.register(
        "SetBadgeCount",
        sync(move |message| {
            let count = message["data"]["count"].as_i64().unwrap_or(0);
            let overlay = message["data"]["overlayIconDataUrl"].as_str();
            let ok = set_badge(&app, count, overlay);
            json!({ "type": "OnSetBadgeCount", "success": true, "data": { "success": ok } })
        }),
    );

    let app = context.app.clone();
    host.register(
        "OpenURL",
        sync(move |message| {
            let Some(url) = web_url_of(&message) else {
                return json!({
                    "type": "OnOpenURL",
                    "success": false,
                    "error": { "code": "INVALID", "message": "An http or https url is required." },
                });
            };
            match app.opener().open_url(url.as_str(), None::<&str>) {
                Ok(()) => json!({ "type": "OnOpenURL", "success": true, "data": {} }),
                Err(error) => json!({
                    "type": "OnOpenURL",
                    "success": false,
                    "error": { "code": "OPEN_FAILED", "message": error.to_string() },
                }),
            }
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_preference_echoes_the_key() {
        let reply = save_preference(&json!({ "data": { "key": "theme", "value": "dark" } }));
        assert_eq!(reply["data"]["key"], "theme");
        assert_eq!(reply["data"]["success"], true);
    }

    #[test]
    fn the_fcm_token_is_empty() {
        assert_eq!(fcm_token()["data"]["token"], "");
    }

    #[test]
    fn only_http_and_https_urls_open() {
        let ok = |url: &str| web_url_of(&json!({ "data": { "url": url } })).is_some();
        assert!(ok("https://example.test/a"));
        assert!(ok("http://example.test/"));
        assert!(!ok("file:///etc/passwd"));
        assert!(!ok("javascript:alert(1)"));
        assert!(!ok("chatic://oauth?code=1"));
        assert!(!ok("not a url"));
        assert!(!ok(&format!(
            "https://example.test/{}",
            "a".repeat(URL_MAX)
        )));
        assert!(web_url_of(&json!({ "data": {} })).is_none());
    }

    #[test]
    fn a_png_data_url_decodes_and_anything_else_does_not() {
        assert_eq!(
            png_from_data_url("data:image/png;base64,aGk="),
            Some(b"hi".to_vec())
        );
        assert_eq!(png_from_data_url("data:image/svg+xml;base64,aGk="), None);
        assert_eq!(png_from_data_url("data:image/png;base64,***"), None);
    }
}
