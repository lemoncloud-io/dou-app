use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::Instant;

use serde_json::{Value, json};

pub const MESSAGE_MAX: usize = 256 * 1024;
const WINDOW_MS: u64 = 60_000;
const GLOBAL_PER_MINUTE: usize = 300;
const GLOBAL: &str = "*";

fn per_minute(kind: &str) -> Option<usize> {
    match kind {
        "ShowNotification" | "OpenURL" => Some(10),
        "OpenSubWebView" => Some(6),
        "OAuthLogin" => Some(5),
        "StorageSave" | "FetchUrlMetadata" => Some(30),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    TooLarge,
    TooMany,
}

impl Refusal {
    pub fn code(self) -> &'static str {
        match self {
            Refusal::TooLarge => "INVALID",
            Refusal::TooMany => "RATE_LIMITED",
        }
    }

    pub fn message(self) -> &'static str {
        match self {
            Refusal::TooLarge => "The message is larger than the shell accepts.",
            Refusal::TooMany => "Too many requests of this kind. Wait before sending again.",
        }
    }
}

pub fn refusal_reply(refusal: Refusal, request: Option<&Value>) -> String {
    let field = |name: &str| {
        request
            .and_then(|request| request.get(name))
            .cloned()
            .unwrap_or(Value::Null)
    };
    json!({
        "type": "ERROR",
        "refId": field("refId"),
        "version": field("version"),
        "nonce": field("nonce"),
        "success": false,
        "error": {
            "code": refusal.code(),
            "message": refusal.message(),
            "requestType": field("type"),
            "recoverable": true,
        },
    })
    .to_string()
}

pub struct Limits {
    started: Instant,
    seen: Mutex<HashMap<String, VecDeque<u64>>>,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            started: Instant::now(),
            seen: Mutex::new(HashMap::new()),
        }
    }
}

impl Limits {
    pub fn admit(&self, kind: &str, size: usize) -> Result<(), Refusal> {
        let now = u64::try_from(self.started.elapsed().as_millis()).unwrap_or(u64::MAX);
        self.admit_at(kind, size, now)
    }

    pub fn admit_at(&self, kind: &str, size: usize, now_ms: u64) -> Result<(), Refusal> {
        if size > MESSAGE_MAX {
            return Err(Refusal::TooLarge);
        }
        let mut seen = self.seen.lock().unwrap_or_else(|e| e.into_inner());
        let mut keys = vec![(GLOBAL, GLOBAL_PER_MINUTE)];
        if let Some(cap) = per_minute(kind) {
            keys.push((kind, cap));
        }
        for (key, cap) in &keys {
            let window = seen.entry((*key).to_string()).or_default();
            while window
                .front()
                .is_some_and(|at| now_ms.saturating_sub(*at) >= WINDOW_MS)
            {
                window.pop_front();
            }
            if window.len() >= *cap {
                return Err(Refusal::TooMany);
            }
        }
        for (key, _) in keys {
            if let Some(window) = seen.get_mut(key) {
                window.push_back(now_ms);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_kind_is_held_to_its_budget_and_refills_after_a_minute() {
        let limits = Limits::default();
        for i in 0..10 {
            assert_eq!(limits.admit_at("ShowNotification", 10, i), Ok(()));
        }
        assert_eq!(
            limits.admit_at("ShowNotification", 10, 20),
            Err(Refusal::TooMany)
        );
        assert_eq!(limits.admit_at("OpenURL", 10, 20), Ok(()));
        assert_eq!(limits.admit_at("ShowNotification", 10, 60_000), Ok(()));
    }

    #[test]
    fn an_oversize_message_is_refused_before_it_costs_budget() {
        let limits = Limits::default();
        assert_eq!(
            limits.admit_at("StorageSave", MESSAGE_MAX + 1, 0),
            Err(Refusal::TooLarge)
        );
        for i in 0..30 {
            assert_eq!(limits.admit_at("StorageSave", MESSAGE_MAX, i), Ok(()));
        }
    }

    #[test]
    fn every_kind_shares_one_global_budget() {
        let limits = Limits::default();
        for i in 0..GLOBAL_PER_MINUTE {
            assert_eq!(
                limits.admit_at("Ping", 1, u64::try_from(i).unwrap()),
                Ok(())
            );
        }
        assert_eq!(limits.admit_at("Ping", 1, 1000), Err(Refusal::TooMany));
        assert_eq!(
            limits.admit_at("SetBadgeCount", 1, 1000),
            Err(Refusal::TooMany)
        );
    }

    #[test]
    fn a_refused_request_does_not_spend_the_global_budget() {
        let limits = Limits::default();
        for i in 0..5 {
            assert!(limits.admit_at("OAuthLogin", 1, i).is_ok());
        }
        for i in 5..50 {
            assert!(limits.admit_at("OAuthLogin", 1, i).is_err());
        }
        let seen = limits.seen.lock().unwrap();
        assert_eq!(seen[GLOBAL].len(), 5);
    }

    #[test]
    fn the_refusal_answers_the_request_it_belongs_to() {
        let request = json!({ "type": "OpenURL", "refId": "r9", "version": "1.0", "nonce": "n" });
        let reply: Value =
            serde_json::from_str(&refusal_reply(Refusal::TooMany, Some(&request))).unwrap();
        assert_eq!(reply["refId"], "r9");
        assert_eq!(reply["error"]["code"], "RATE_LIMITED");
        assert_eq!(reply["error"]["requestType"], "OpenURL");
        let bare: Value = serde_json::from_str(&refusal_reply(Refusal::TooLarge, None)).unwrap();
        assert_eq!(bare["refId"], Value::Null);
        assert_eq!(bare["error"]["code"], "INVALID");
    }
}
