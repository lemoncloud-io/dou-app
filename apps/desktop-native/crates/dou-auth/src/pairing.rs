use std::time::Duration;

use dou_core::{Error, Result};
use serde_json::Value;

use crate::relay::{PairingRequestView, RelayApi};
use crate::token::TokenView;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PairingPhase {
    Waiting { code: String },
    Applying,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PairingRequest {
    pub view: PairingRequestView,
}

pub fn client_label() -> (String, String) {
    let platform = match std::env::consts::OS {
        "macos" => "macOS",
        "windows" => "Windows",
        "linux" => "Linux",
        other => other,
    };
    (
        format!("DoU Desktop (native) · {platform}"),
        platform.to_string(),
    )
}

impl PairingRequest {
    pub async fn start(api: &RelayApi, device: &TokenView, device_id: &str) -> Result<Self> {
        let (name, platform) = client_label();
        let mut attempt = 0;
        loop {
            match api
                .pairing_request(device, device_id, &name, &platform)
                .await
            {
                Ok(view) => return Ok(Self { view }),
                Err(Error::Http { status: 503, .. }) if attempt < 3 => attempt += 1,
                Err(error) => return Err(error),
            }
        }
    }

    pub async fn wait(
        &self,
        api: &RelayApi,
        device: &TokenView,
        on_phase: impl Fn(PairingPhase),
        poll_unit: Duration,
    ) -> Result<TokenView> {
        on_phase(PairingPhase::Waiting {
            code: self.view.code.clone(),
        });
        let interval = poll_unit * u32::try_from(self.view.interval.max(1)).unwrap_or(1);
        let deadline = tokio::time::Instant::now() + expires_in(self.view.expired_at, poll_unit);
        let mut past_deadline = false;
        loop {
            match api.pairing_claim(device, &self.view.pairing_id).await {
                Ok(answer) => match status_of(&answer) {
                    "approved" => {
                        on_phase(PairingPhase::Applying);
                        return session_of(answer);
                    }
                    "pending" => {}
                    other => return Err(Error::Pairing(other.to_string())),
                },
                Err(Error::Http { status, message }) if (400..500).contains(&status) => {
                    return Err(Error::Http { status, message });
                }
                Err(_) => {}
            }
            if past_deadline {
                return Err(Error::Pairing("expired".into()));
            }
            if tokio::time::Instant::now() >= deadline {
                past_deadline = true;
                continue;
            }
            tokio::time::sleep(interval).await;
        }
    }
}

fn expires_in(expired_at: i64, poll_unit: Duration) -> Duration {
    if poll_unit < Duration::from_secs(1) {
        return poll_unit * 50;
    }
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(0));
    Duration::from_millis(u64::try_from((expired_at - now_ms).max(0)).unwrap_or(0))
}

fn status_of(answer: &Value) -> &str {
    answer
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
}

fn is_cloud_target(answer: &Value) -> bool {
    answer.pointer("/target/type").and_then(Value::as_str) == Some("cloud")
}

fn session_of(answer: Value) -> Result<TokenView> {
    let session = match answer.get("session") {
        Some(session) => session.clone(),
        None if is_cloud_target(&answer) => return Err(Error::PairingNeedsAccount),
        None => return Err(Error::Pairing("approved without a session".into())),
    };
    serde_json::from_value(session).map_err(|e| Error::InvalidResponse(e.to_string()))
}
