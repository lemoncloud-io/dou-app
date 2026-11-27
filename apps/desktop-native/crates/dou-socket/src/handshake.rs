use dou_core::Result;
use serde_json::{Value, json};

use crate::socket::Socket;

pub fn device_platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "macos",
        "windows" => "windows",
        "linux" => "linux",
        _ => "web",
    }
}

pub struct Authenticated {
    pub socket: Socket,
    pub state: Value,
}

pub async fn open_session(
    url: &str,
    user_agent: &str,
    identity_token: &str,
    device_id: &str,
    device_name: &str,
) -> Result<Authenticated> {
    let socket = Socket::connect(url, user_agent).await?;
    let device = json!({ "id": device_id, "platform": device_platform(), "name": device_name });
    socket.request("device.save", Some(&device), None).await?;
    let state = socket
        .request(
            "auth.update",
            Some(&json!({ "token": identity_token })),
            None,
        )
        .await?;
    Ok(Authenticated { socket, state })
}
