use std::time::{SystemTime, UNIX_EPOCH};

use ::oauth::{Pending, Provider, Start, authorize_url, parse_deeplink};
use bridge_host::BridgeHost;
use serde_json::{Value, json};
use tauri::{AppHandle, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

use super::Context;
use crate::bridge::push_event;

const DEFAULT_RELAY: &str = "https://oauth2.eureka.codes";
const PROD_HANDOFF: &str = "https://desktop.dou.chatic.io";
const DEV_HANDOFF: &str = "https://desktop.dou-dev.chatic.io";

pub struct Endpoints {
    pub relay: String,
    pub handoff: String,
}

pub fn endpoints(stage: &str) -> Endpoints {
    Endpoints {
        relay: option_env!("DOU_SOCIAL_OAUTH_ENDPOINT")
            .unwrap_or(DEFAULT_RELAY)
            .to_string(),
        handoff: option_env!("DOU_HANDOFF_URL")
            .unwrap_or(if stage == "prod" {
                PROD_HANDOFF
            } else {
                DEV_HANDOFF
            })
            .to_string(),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as u64)
}

fn platform(os: &str) -> &'static str {
    match os {
        "macos" => "macos",
        "windows" => "windows",
        _ => "web",
    }
}

pub fn failure(code: &str, message: &str) -> Value {
    json!({
        "type": "OnOAuthLogin",
        "success": false,
        "error": { "code": code, "message": message },
    })
}

pub fn login_event(accepted: &::oauth::Accepted, os: &str) -> Value {
    json!({
        "result": {
            "platform": platform(os),
            "provider": accepted.provider.as_str(),
            "code": accepted.code,
        }
    })
}

pub fn begin(
    pending: &Pending,
    endpoints: &Endpoints,
    message: &Value,
    nonce: String,
    now_ms: u64,
) -> Result<url::Url, Value> {
    let Some(provider) = message["data"]["provider"]
        .as_str()
        .and_then(Provider::parse)
    else {
        return Err(failure("INVALID", "A supported provider is required."));
    };
    let start = Start {
        provider,
        started_at_ms: now_ms,
        nonce,
    };
    let Some(url) = authorize_url(&endpoints.relay, &endpoints.handoff, &start) else {
        return Err(failure("INVALID", "The sign-in address is not usable."));
    };
    pending.begin(start);
    Ok(url)
}

pub fn receive(pending: &Pending, raw: &str, os: &str, now_ms: u64) -> Option<Value> {
    let link = parse_deeplink(raw)?;
    match pending.accept(&link, now_ms) {
        Ok(accepted) => Some(login_event(&accepted, os)),
        Err(reason) => {
            crate::logs::shell(&format!("sign-in link refused: {reason:?}"));
            None
        }
    }
}

pub fn take_links(app: &AppHandle, urls: impl IntoIterator<Item = url::Url>) {
    let Some(pending) = app.try_state::<Pending>() else {
        return;
    };
    for url in urls {
        if let Some(data) = receive(&pending, url.as_str(), std::env::consts::OS, now_ms()) {
            push_event(app, "OnOAuthLogin", data);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

pub fn listen(app: &AppHandle) {
    #[cfg(any(windows, target_os = "linux"))]
    let _ = app.deep_link().register_all();
    let handle = app.clone();
    app.deep_link()
        .on_open_url(move |event| take_links(&handle, event.urls()));
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        take_links(app, urls);
    }
}

pub fn register(host: &mut BridgeHost, context: &Context) {
    context.app.manage(Pending::default());
    let app = context.app.clone();
    let endpoints = endpoints(&context.stage);
    host.register(
        "OAuthLogin",
        std::sync::Arc::new(move |message| {
            let app = app.clone();
            let outcome = begin(
                &app.state::<Pending>(),
                &endpoints,
                &message,
                uuid::Uuid::new_v4().simple().to_string(),
                now_ms(),
            );
            let reply = match outcome {
                Ok(url) => match app.opener().open_url(url.as_str(), None::<&str>) {
                    Ok(()) => None,
                    Err(error) => Some(failure("OPEN_FAILED", &error.to_string())),
                },
                Err(reply) => Some(reply),
            };
            Box::pin(async move { Ok(reply) })
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn endpoints() -> Endpoints {
        Endpoints {
            relay: "https://oauth2.eureka.codes".into(),
            handoff: "https://desktop.dou.chatic.io".into(),
        }
    }

    fn started(provider: &str) -> (Pending, url::Url) {
        let pending = Pending::default();
        let url = begin(
            &pending,
            &endpoints(),
            &json!({ "data": { "provider": provider } }),
            "n0nce".into(),
            1_000,
        )
        .unwrap();
        (pending, url)
    }

    #[test]
    fn the_prod_start_opens_the_prod_relay_and_hand_off() {
        let (_, url) = started("google");
        assert_eq!(
            url.origin().ascii_serialization(),
            "https://oauth2.eureka.codes"
        );
        assert_eq!(url.path(), "/oauth/google/authorize");
        let redirect = url.query_pairs().find(|(k, _)| k == "redirect").unwrap().1;
        assert_eq!(
            redirect,
            "https://desktop.dou.chatic.io/auth/oauth-response?nonce=n0nce&provider=google"
        );
    }

    #[test]
    fn the_stage_picks_the_hand_off_host() {
        assert_eq!(endpoints_for("prod"), PROD_HANDOFF);
        assert_eq!(endpoints_for("dev"), DEV_HANDOFF);
    }

    fn endpoints_for(stage: &str) -> String {
        super::endpoints(stage).handoff
    }

    #[test]
    fn an_unknown_provider_is_refused_and_starts_nothing() {
        let pending = Pending::default();
        for message in [
            json!({ "data": { "provider": "kakao" } }),
            json!({ "data": {} }),
        ] {
            let reply = begin(&pending, &endpoints(), &message, "n".into(), 1).unwrap_err();
            assert_eq!(reply["success"], false);
            assert_eq!(reply["error"]["code"], "INVALID");
        }
        assert!(
            receive(
                &pending,
                "chatic://oauth?provider=google&code=c&nonce=n",
                "macos",
                2
            )
            .is_none()
        );
    }

    #[test]
    fn a_matching_deeplink_answers_the_code_once() {
        let (pending, _) = started("google");
        let link = "chatic://oauth?provider=google&code=the-code&nonce=n0nce";
        let event = receive(&pending, link, "macos", 2_000).unwrap();
        assert_eq!(
            event,
            json!({ "result": { "platform": "macos", "provider": "google", "code": "the-code" } })
        );
        assert!(receive(&pending, link, "macos", 2_000).is_none());
    }

    #[test]
    fn a_deeplink_that_does_not_match_the_start_is_refused() {
        for link in [
            "chatic://oauth?provider=apple&code=c&nonce=n0nce",
            "chatic://oauth?provider=google&code=c",
            "chatic://oauth?provider=google&code=c&nonce=other",
            "chatic://oauth?provider=google&nonce=n0nce",
            "chatic://open?provider=google&code=c&nonce=n0nce",
            "https://evil.test/?provider=google&code=c&nonce=n0nce",
        ] {
            let (pending, _) = started("google");
            assert!(receive(&pending, link, "macos", 2_000).is_none(), "{link}");
        }
    }

    #[test]
    fn a_deeplink_without_a_start_or_after_ten_minutes_is_refused() {
        let link = "chatic-dev://oauth?provider=google&code=c&nonce=n0nce";
        assert!(receive(&Pending::default(), link, "macos", 2_000).is_none());
        let (pending, _) = started("google");
        assert!(receive(&pending, link, "macos", 1_000 + 10 * 60 * 1000).is_none());
    }

    #[test]
    fn the_platform_is_one_the_web_knows() {
        assert_eq!(platform("macos"), "macos");
        assert_eq!(platform("windows"), "windows");
        assert_eq!(platform("linux"), "web");
    }
}