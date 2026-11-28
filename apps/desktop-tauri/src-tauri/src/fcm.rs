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

fn clipped(value: &Value, max: usize) -> String {
    value
        .as_str()
        .unwrap_or_default()
        .trim()
        .chars()
        .take(max)
        .collect()
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
