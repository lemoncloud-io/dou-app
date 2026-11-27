use bridge_host::BridgeHost;
use serde_json::{Value, json};
use tauri_plugin_notification::NotificationExt;

use super::{Context, sync};

const TITLE_MAX: usize = 200;
const BODY_MAX: usize = 1000;

pub fn fields_of(message: &Value) -> Option<(String, String)> {
    let data = &message["data"];
    let title = data["title"].as_str()?.trim();
    let body = data["body"].as_str().unwrap_or_default();
    if title.is_empty() {
        return None;
    }
    Some((
        title.chars().take(TITLE_MAX).collect(),
        body.chars().take(BODY_MAX).collect(),
    ))
}

pub fn register(host: &mut BridgeHost, context: &Context) {
    let app = context.app.clone();
    host.register(
        "ShowNotification",
        sync(move |message| {
            let Some((title, body)) = fields_of(&message) else {
                return json!({
                    "type": "OnShowNotification",
                    "success": false,
                    "error": { "code": "INVALID", "message": "A title is required." },
                });
            };
            let shown = app
                .notification()
                .builder()
                .title(title)
                .body(body)
                .show()
                .is_ok();
            json!({ "type": "OnShowNotification", "success": true, "data": { "success": shown } })
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_title_and_a_body_become_the_notification() {
        let message =
            json!({ "data": { "title": "Alex", "body": "hello", "deeplink": "chatic://room/1" } });
        assert_eq!(fields_of(&message), Some(("Alex".into(), "hello".into())));
    }

    #[test]
    fn a_missing_or_blank_title_is_refused() {
        assert_eq!(fields_of(&json!({ "data": { "body": "x" } })), None);
        assert_eq!(
            fields_of(&json!({ "data": { "title": "  ", "body": "x" } })),
            None
        );
        assert_eq!(fields_of(&json!({ "data": { "title": 5 } })), None);
    }

    #[test]
    fn a_missing_body_is_empty_and_long_text_is_cut() {
        let long = "a".repeat(5000);
        let (title, body) =
            fields_of(&json!({ "data": { "title": long, "body": long } })).expect("fields");
        assert_eq!(title.chars().count(), TITLE_MAX);
        assert_eq!(body.chars().count(), BODY_MAX);
        assert_eq!(
            fields_of(&json!({ "data": { "title": "t" } })),
            Some(("t".into(), String::new()))
        );
    }
}
