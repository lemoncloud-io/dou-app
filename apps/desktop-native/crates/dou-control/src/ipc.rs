use std::future::Future;
use std::path::Path;
use std::sync::Arc;

use dou_core::{Error, Result};
use interprocess::local_socket::tokio::{Stream, prelude::*};
use interprocess::local_socket::{ListenerOptions, Name};
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::guard::Client;

fn io(error: impl std::fmt::Display) -> Error {
    Error::Network(format!("control: {error}"))
}

fn path_hash(profile_dir: &Path) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in profile_dir.to_string_lossy().bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    hash
}

fn label(client: Client) -> &'static str {
    match client {
        Client::Cli => "cli",
        Client::Mcp => "mcp",
    }
}

#[cfg(unix)]
pub fn control_name(profile_dir: &Path, client: Client) -> String {
    let beside = profile_dir
        .join(format!("{}.sock", label(client)))
        .to_string_lossy()
        .into_owned();
    if beside.len() <= 90 {
        return beside;
    }
    format!(
        "/tmp/dou-native-{:016x}/{}.sock",
        path_hash(profile_dir),
        label(client)
    )
}

#[cfg(not(unix))]
pub fn control_name(profile_dir: &Path, client: Client) -> String {
    format!(
        "dou-native-{:016x}-{}",
        path_hash(profile_dir),
        label(client)
    )
}

#[cfg(unix)]
fn name_of(name: &str) -> Result<Name<'_>> {
    use interprocess::local_socket::{GenericFilePath, ToFsName};
    name.to_fs_name::<GenericFilePath>().map_err(io)
}

#[cfg(not(unix))]
fn name_of(name: &str) -> Result<Name<'_>> {
    use interprocess::local_socket::{GenericNamespaced, ToNsName};
    name.to_ns_name::<GenericNamespaced>().map_err(io)
}

#[cfg(unix)]
fn own_uid() -> Result<u32> {
    use std::os::unix::fs::MetadataExt;
    let home = std::env::var_os("HOME").ok_or_else(|| io("HOME is not set"))?;
    Ok(std::fs::metadata(home).map_err(io)?.uid())
}

#[cfg(unix)]
fn secure_parent(name: &str, create: bool) -> Result<()> {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let parent = Path::new(name)
        .parent()
        .ok_or_else(|| io("endpoint has no directory"))?;
    let me = own_uid()?;
    if create {
        std::fs::create_dir_all(parent).map_err(io)?;
        if std::fs::metadata(parent).map_err(io)?.uid() == me {
            std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700)).map_err(io)?;
        }
    }
    let meta = std::fs::metadata(parent).map_err(io)?;
    if meta.uid() != me || meta.mode() & 0o077 != 0 {
        return Err(io(format!(
            "{} is not a private directory of this user",
            parent.display()
        )));
    }
    Ok(())
}

pub trait Handler: Send + Sync + 'static {
    fn handle(
        &self,
        client: Client,
        method: String,
        params: Value,
    ) -> impl Future<Output = std::result::Result<Value, Value>> + Send;
}

impl<R: dou_engine::Remote + 'static> Handler for crate::service::Service<R> {
    async fn handle(
        &self,
        client: Client,
        method: String,
        params: Value,
    ) -> std::result::Result<Value, Value> {
        crate::service::Service::handle(self, client, &method, params).await
    }
}

pub async fn serve<H: Handler>(name: &str, handler: Arc<H>, client: Client) -> Result<()> {
    #[cfg(unix)]
    secure_parent(name, true)?;
    let listener = ListenerOptions::new()
        .name(name_of(name)?)
        .try_overwrite(true)
        .create_tokio()
        .map_err(io)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(name, std::fs::Permissions::from_mode(0o600)).map_err(io)?;
    }
    loop {
        let connection = listener.accept().await.map_err(io)?;
        let handler = Arc::clone(&handler);
        tokio::spawn(async move {
            let mut writer = &connection;
            let mut lines = BufReader::new(&connection).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let reply = answer(&*handler, client, &line).await;
                if writer
                    .write_all(format!("{reply}\n").as_bytes())
                    .await
                    .is_err()
                {
                    break;
                }
            }
        });
    }
}

async fn answer<H: Handler>(handler: &H, client: Client, line: &str) -> Value {
    let Ok(request) = serde_json::from_str::<Value>(line) else {
        return json!({ "ok": false, "error": { "code": "bad_request", "message": "not JSON" } });
    };
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let params = request.get("params").cloned().unwrap_or(Value::Null);
    match handler.handle(client, method, params).await {
        Ok(result) => json!({ "ok": true, "result": result }),
        Err(error) => json!({ "ok": false, "error": error }),
    }
}

pub async fn call(
    name: &str,
    method: &str,
    params: Value,
) -> Result<std::result::Result<Value, Value>> {
    #[cfg(unix)]
    secure_parent(name, false)?;
    let stream = Stream::connect(name_of(name)?).await.map_err(io)?;
    let mut writer = &stream;
    let request = json!({ "method": method, "params": params });
    writer
        .write_all(format!("{request}\n").as_bytes())
        .await
        .map_err(io)?;
    let mut lines = BufReader::new(&stream).lines();
    let line = lines
        .next_line()
        .await
        .map_err(io)?
        .ok_or_else(|| Error::Network("control: connection closed".into()))?;
    let reply: Value = serde_json::from_str(&line).map_err(io)?;
    if reply["ok"] == true {
        Ok(Ok(reply["result"].clone()))
    } else {
        Ok(Err(reply["error"].clone()))
    }
}
