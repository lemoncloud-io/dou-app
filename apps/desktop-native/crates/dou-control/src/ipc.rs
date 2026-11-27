use std::future::Future;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use dou_core::{Error, Result};
use interprocess::local_socket::tokio::{Stream, prelude::*};
use interprocess::local_socket::{ListenerOptions, Name};
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::Semaphore;

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
        Client::App => "app",
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

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub max_connections: usize,
    pub max_line: usize,
    pub request_timeout: Duration,
    pub idle_timeout: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_connections: 32,
            max_line: 1024 * 1024,
            request_timeout: Duration::from_secs(75),
            idle_timeout: Duration::from_secs(300),
        }
    }
}

enum Line {
    Text(String),
    TooLong,
    End,
}

async fn next_line<R: AsyncBufReadExt + Unpin>(
    reader: &mut R,
    max: usize,
) -> std::io::Result<Line> {
    let mut buffer = Vec::new();
    let read = reader
        .take(max as u64 + 1)
        .read_until(b'\n', &mut buffer)
        .await?;
    if read == 0 {
        return Ok(Line::End);
    }
    if buffer.last() == Some(&b'\n') {
        buffer.pop();
    } else if buffer.len() > max {
        return Ok(Line::TooLong);
    }
    if buffer.len() > max {
        return Ok(Line::TooLong);
    }
    Ok(Line::Text(String::from_utf8_lossy(&buffer).into_owned()))
}

async fn discard_line<R: AsyncBufReadExt + Unpin>(reader: &mut R) {
    let mut sink = Vec::new();
    loop {
        sink.clear();
        match reader.take(64 * 1024).read_until(b'\n', &mut sink).await {
            Ok(0) | Err(_) => return,
            Ok(_) if sink.last() == Some(&b'\n') => return,
            Ok(_) => {}
        }
    }
}

fn failure(code: &str, message: &str) -> Value {
    json!({ "ok": false, "error": { "code": code, "message": message } })
}

pub async fn serve<H: Handler>(name: &str, handler: Arc<H>, client: Client) -> Result<()> {
    serve_with(name, handler, client, Limits::default()).await
}

pub async fn serve_with<H: Handler>(
    name: &str,
    handler: Arc<H>,
    client: Client,
    limits: Limits,
) -> Result<()> {
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
    let slots = Arc::new(Semaphore::new(limits.max_connections));
    loop {
        let connection = match listener.accept().await {
            Ok(connection) => connection,
            Err(error) => {
                eprintln!("control: accept failed ({error}); still serving");
                tokio::time::sleep(Duration::from_millis(100)).await;
                continue;
            }
        };
        let Ok(permit) = Arc::clone(&slots).try_acquire_owned() else {
            eprintln!(
                "control: connection refused, {} already open",
                limits.max_connections
            );
            continue;
        };
        let handler = Arc::clone(&handler);
        tokio::spawn(async move {
            let _permit = permit;
            let mut writer = &connection;
            let mut reader = BufReader::new(&connection);
            loop {
                let line = match tokio::time::timeout(
                    limits.idle_timeout,
                    next_line(&mut reader, limits.max_line),
                )
                .await
                {
                    Ok(Ok(Line::Text(line))) => line,
                    Ok(Ok(Line::TooLong)) => {
                        let reply = failure("bad_request", "request line is too long");
                        let _ = writer.write_all(format!("{reply}\n").as_bytes()).await;
                        let _ =
                            tokio::time::timeout(Duration::from_secs(1), discard_line(&mut reader))
                                .await;
                        break;
                    }
                    _ => break,
                };
                let reply = match tokio::time::timeout(
                    limits.request_timeout,
                    answer(&*handler, client, &line),
                )
                .await
                {
                    Ok(reply) => reply,
                    Err(_) => failure("timeout", "the request took too long"),
                };
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
        return failure("bad_request", "not JSON");
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

#[cfg(all(test, unix))]
mod tests {
    use std::os::unix::fs::PermissionsExt;

    use super::*;

    fn scratch(mode: u32) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("dc-{}", uuid_like()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(mode)).unwrap();
        dir
    }

    fn uuid_like() -> String {
        format!(
            "{:x}",
            path_hash(&std::env::temp_dir().join(format!("{:?}", std::time::Instant::now())))
        )
    }

    #[test]
    fn a_directory_open_to_group_or_others_is_refused_by_the_client() {
        let dir = scratch(0o755);
        let name = dir.join("cli.sock").to_string_lossy().into_owned();
        let error = secure_parent(&name, false).unwrap_err().to_string();
        assert!(error.contains("not a private directory"), "{error}");
    }

    #[test]
    fn serving_tightens_a_directory_the_user_owns_and_accepts_it() {
        let dir = scratch(0o755);
        let name = dir.join("cli.sock").to_string_lossy().into_owned();
        secure_parent(&name, true).unwrap();
        assert_eq!(
            std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777,
            0o700
        );
        secure_parent(&name, false).unwrap();
    }
}
