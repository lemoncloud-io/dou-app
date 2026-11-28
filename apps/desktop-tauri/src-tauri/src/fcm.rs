use std::time::Duration;

use serde_json::{Map, Value, json};
use tokio::sync::watch;

pub const TOKEN_WAIT: Duration = Duration::from_secs(30);
pub const TOKEN_MAX: usize = 4096;
pub const TITLE_MAX: usize = 200;
pub const BODY_MAX: usize = 1000;

#[derive(Debug, Clone, PartialEq, Eq)]
enum TokenState {
    Waiting,
    Off,
    Ready(String),
}

pub struct TokenSlot {
    state: watch::Sender<TokenState>,
}

impl TokenSlot {
    pub fn new(sidecar: bool) -> Self {
        let (state, _) = watch::channel(if sidecar {
            TokenState::Waiting
        } else {
            TokenState::Off
        });
        Self { state }
    }

    pub fn set(&self, token: Option<String>) -> Option<String> {
        let next = match token {
            Some(token) if !token.is_empty() => TokenState::Ready(token),
            _ => TokenState::Off,
        };
        let mut fresh = None;
        self.state.send_if_modified(|state| {
            if *state == next {
                return false;
            }
            if let TokenState::Ready(token) = &next {
                fresh = Some(token.clone());
            }
            *state = next.clone();
            true
        });
        fresh
    }

    pub async fn wait(&self, limit: Duration) -> String {
        let mut changes = self.state.subscribe();
        let settled = tokio::time::timeout(
            limit,
            changes.wait_for(|state| *state != TokenState::Waiting),
        )
        .await;
        match settled {
            Ok(Ok(state)) => match &*state {
                TokenState::Ready(token) => token.clone(),
                _ => String::new(),
            },
            _ => String::new(),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Route {
    InApp,
    Os,
}

pub fn route(visible: bool, focused: bool, minimized: bool) -> Route {
    if visible && focused && !minimized {
        Route::InApp
    } else {
        Route::Os
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Push {
    pub title: String,
    pub body: String,
    pub deeplink: Option<String>,
    pub data: Map<String, Value>,
}

pub fn clip(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

fn clipped(value: &Value, max: usize) -> String {
    clip(value.as_str().unwrap_or_default().trim(), max)
}

pub fn push_of(params: &Value) -> Option<Push> {
    let data = params.get("data")?.as_object()?;
    Some(Push {
        title: clipped(&params["title"], TITLE_MAX),
        body: clipped(&params["body"], BODY_MAX),
        deeplink: params["deeplink"].as_str().map(str::to_string),
        data: data
            .iter()
            .filter(|(_, value)| value.is_string())
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
    })
}

pub fn in_app_event(push: &Push) -> Value {
    json!({ "notification": { "title": push.title, "body": push.body, "data": push.data } })
}

pub const PATH_MAX: usize = 2048;
const PARSE_BASE: &str = "http://chatic.local";
const CONTEXT_KEYS: [&str; 3] = ["cid", "sid", "chatId"];

fn text_of(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn context_of(data: &Map<String, Value>) -> Map<String, Value> {
    let mut source = data.clone();
    let payload = match data.get("payload") {
        Some(Value::String(text)) => serde_json::from_str::<Value>(text).ok(),
        Some(value @ Value::Object(_)) => Some(value.clone()),
        _ => None,
    };
    if let Some(Value::Object(payload)) = payload {
        source.extend(payload);
    }
    source
}

fn encode_component(text: &str) -> String {
    text.bytes()
        .map(|byte| match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => (byte as char).to_string(),
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

fn strip_scheme(link: &str) -> &str {
    match link.split_once("://") {
        Some((scheme, rest))
            if scheme.starts_with(|c: char| c.is_ascii_alphabetic())
                && scheme
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.')) =>
        {
            rest
        }
        _ => link,
    }
}

pub fn checked_path(path: &str) -> Option<String> {
    (path.starts_with('/') && path.len() <= PATH_MAX).then(|| path.to_string())
}

pub fn tap_path(data: &Map<String, Value>, deeplink: Option<&str>) -> Option<String> {
    let link = text_of(data.get("link"))
        .or_else(|| text_of(data.get("clickAction")))
        .or_else(|| deeplink.map(str::trim).filter(|text| !text.is_empty()));
    let context = context_of(data);
    let Some(link) = link else {
        if text_of(data.get("type")) != Some("cloud") {
            return None;
        }
        return Some(match text_of(context.get("cid")) {
            Some(cid) => format!("/?cid={}", encode_component(cid)),
            None => "/".to_string(),
        });
    };
    let url = url::Url::parse(PARSE_BASE)
        .ok()?
        .join(strip_scheme(link))
        .ok()?;
    let mut query: Vec<String> = url
        .query()
        .filter(|q| !q.is_empty())
        .map(str::to_string)
        .into_iter()
        .collect();
    for key in CONTEXT_KEYS {
        if let Some(value) = text_of(context.get(key))
            && !url.query_pairs().any(|(name, _)| name == key)
        {
            query.push(format!("{key}={}", encode_component(value)));
        }
    }
    let search = if query.is_empty() {
        String::new()
    } else {
        format!("?{}", query.join("&"))
    };
    let hash = url.fragment().map(|f| format!("#{f}")).unwrap_or_default();
    checked_path(&format!("{}{search}{hash}", url.path()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token(slot: &TokenSlot) -> String {
        tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("runtime")
            .block_on(slot.wait(Duration::from_millis(50)))
    }

    #[test]
    fn with_no_sidecar_the_token_is_empty_at_once() {
        let slot = TokenSlot::new(false);
        assert_eq!(token(&slot), "");
    }

    #[test]
    fn a_waiting_slot_gives_up_empty_after_the_limit() {
        assert_eq!(token(&TokenSlot::new(true)), "");
    }

    #[tokio::test]
    async fn a_waiting_request_gets_the_token_when_it_arrives() {
        let slot = std::sync::Arc::new(TokenSlot::new(true));
        let waiter = {
            let slot = std::sync::Arc::clone(&slot);
            tokio::spawn(async move { slot.wait(Duration::from_secs(5)).await })
        };
        tokio::task::yield_now().await;
        assert_eq!(slot.set(Some("t1".into())), Some("t1".into()));
        assert_eq!(waiter.await.expect("join"), "t1");
    }

    #[test]
    fn only_a_new_token_is_announced() {
        let slot = TokenSlot::new(true);
        assert_eq!(slot.set(Some("t1".into())), Some("t1".into()));
        assert_eq!(slot.set(Some("t1".into())), None);
        assert_eq!(slot.set(Some("t2".into())), Some("t2".into()));
        assert_eq!(slot.set(None), None);
        assert_eq!(token(&slot), "");
        assert_eq!(slot.set(Some("t2".into())), Some("t2".into()));
    }

    #[test]
    fn only_a_visible_focused_unminimised_main_window_gets_the_banner() {
        assert_eq!(route(true, true, false), Route::InApp);
        assert_eq!(route(false, true, false), Route::Os);
        assert_eq!(route(true, false, false), Route::Os);
        assert_eq!(route(true, true, true), Route::Os);
    }

    #[test]
    fn a_push_keeps_string_data_and_cuts_long_text() {
        let long = "a".repeat(5000);
        let push = push_of(&json!({
            "title": long, "body": long, "deeplink": "chatic://x",
            "data": { "cid": "c1", "n": 5 }
        }))
        .expect("push");
        assert_eq!(push.title.chars().count(), TITLE_MAX);
        assert_eq!(push.body.chars().count(), BODY_MAX);
        assert_eq!(push.deeplink.as_deref(), Some("chatic://x"));
        assert_eq!(Value::Object(push.data.clone()), json!({ "cid": "c1" }));
        assert_eq!(
            in_app_event(&push)["notification"]["data"],
            json!({ "cid": "c1" })
        );
        assert_eq!(
            in_app_event(&push)["notification"]["title"]
                .as_str()
                .map(|t| t.chars().count()),
            Some(TITLE_MAX)
        );
    }

    #[test]
    fn a_push_needs_a_data_object() {
        assert!(push_of(&json!({ "title": "t" })).is_none());
        assert!(push_of(&json!("x")).is_none());
        let bare = push_of(&json!({ "data": {} })).expect("push");
        assert_eq!(
            (bare.title.as_str(), bare.body.as_str(), bare.deeplink),
            ("", "", None)
        );
    }
}

#[cfg(test)]
mod tap_tests {
    use super::*;

    fn path(data: Value, deeplink: Option<&str>) -> Option<String> {
        tap_path(data.as_object().expect("object"), deeplink)
    }

    #[test]
    fn tap_path_merges_the_payload_string_context_into_a_relative_link() {
        let data = json!({
            "link": "channel?channelId=room_123",
            "payload": json!({ "cid": "cloud_1", "sid": "100002", "uid": "user_456" }).to_string(),
        });
        assert_eq!(
            path(data, None).as_deref(),
            Some("/channel?channelId=room_123&cid=cloud_1&sid=100002")
        );
    }

    #[test]
    fn tap_path_keeps_the_query_and_merges_a_payload_object() {
        let data = json!({
            "link": "/channels/1000001/room?tab=info",
            "payload": { "cid": "cloud_1", "sid": "site_9" },
        });
        assert_eq!(
            path(data, None).as_deref(),
            Some("/channels/1000001/room?tab=info&cid=cloud_1&sid=site_9")
        );
    }

    #[test]
    fn tap_path_returns_a_bare_link_as_it_is_and_does_not_repeat_a_key() {
        assert_eq!(
            path(json!({ "link": "/channels/1000001/room" }), None).as_deref(),
            Some("/channels/1000001/room")
        );
        assert_eq!(
            path(json!({ "link": "/r?cid=a", "cid": "b" }), None).as_deref(),
            Some("/r?cid=a")
        );
    }

    #[test]
    fn tap_path_is_none_without_a_link() {
        let payload = json!({ "cid": "cloud_1" }).to_string();
        assert_eq!(path(json!({ "payload": payload }), None), None);
        assert_eq!(path(json!({ "link": "   " }), None), None);
        assert_eq!(path(json!({}), None), None);
        assert_eq!(
            path(json!({ "type": "chat", "payload": payload }), None),
            None
        );
        assert_eq!(path(json!({ "type": "notice" }), None), None);
    }

    #[test]
    fn tap_path_sends_a_linkless_cloud_push_to_its_cloud_root() {
        let payload = json!({ "cid": "cloud_1" }).to_string();
        assert_eq!(
            path(
                json!({ "type": "cloud", "cid": "cloud_1", "uid": "u1" }),
                None
            )
            .as_deref(),
            Some("/?cid=cloud_1")
        );
        assert_eq!(
            path(json!({ "type": "cloud", "payload": payload }), None).as_deref(),
            Some("/?cid=cloud_1")
        );
        assert_eq!(
            path(
                json!({ "type": "cloud", "cid": "cloud_1", "sid": "site_9", "chatId": "ch:1" }),
                None
            )
            .as_deref(),
            Some("/?cid=cloud_1")
        );
        assert_eq!(path(json!({ "type": "cloud" }), None).as_deref(), Some("/"));
        assert_eq!(
            path(json!({ "type": "cloud", "cid": "   " }), None).as_deref(),
            Some("/")
        );
        assert_eq!(
            path(json!({ "type": "cloud", "cid": "a&b=c" }), None).as_deref(),
            Some("/?cid=a%26b%3Dc")
        );
        assert_eq!(
            path(json!({ "type": "cloud", "link": "/mypage/clouds" }), None).as_deref(),
            Some("/mypage/clouds")
        );
    }

    #[test]
    fn tap_path_falls_back_to_click_action_then_the_deeplink_and_drops_the_scheme() {
        assert_eq!(
            path(
                json!({ "clickAction": "chatic://channel?channelId=c1" }),
                None
            )
            .as_deref(),
            Some("/channel?channelId=c1")
        );
        assert_eq!(
            path(
                json!({ "cid": "c" }),
                Some("chatic-dev://channels/1/room#m2")
            )
            .as_deref(),
            Some("/channels/1/room?cid=c#m2")
        );
        assert_eq!(
            path(json!({ "link": "/a" }), Some("chatic://b")).as_deref(),
            Some("/a")
        );
    }

    #[test]
    fn tap_path_stays_on_the_web_origin_and_refuses_an_oversized_path() {
        assert_eq!(
            path(json!({ "link": "//evil.test/steal?x=1" }), None).as_deref(),
            Some("/steal?x=1")
        );
        assert_eq!(
            path(json!({ "link": "https://evil.test/steal" }), None).as_deref(),
            Some("/evil.test/steal")
        );
        let long = format!("/{}", "a".repeat(PATH_MAX));
        assert_eq!(path(json!({ "link": long }), None), None);
        assert_eq!(checked_path("/ok").as_deref(), Some("/ok"));
        assert_eq!(checked_path("relative"), None);
    }
}
