use std::io;
use std::sync::Arc;

use base64::Engine as _;
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};

use crate::profile::Paths;

pub const MAX_REQUEST: u64 = 1024 * 1024;

pub trait Host: Send + Sync + 'static {
    fn reload(&self) -> Result<(), String>;
    fn app_source(&self) -> Value;
    fn set_app_source(&self, text: &str) -> Result<Value, String>;
    fn screenshot(&self) -> Result<Vec<u8>, String>;
    fn logs_tail(&self, file: &str, lines: usize) -> Result<Vec<String>, String>;
    fn focus(&self);
    fn second_instance(&self, argv: Vec<String>);
}

fn failure(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn success(id: &Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

pub fn dispatch(host: &dyn Host, line: &str) -> Value {
    let Ok(request) = serde_json::from_str::<Value>(line) else {
        return failure(&Value::Null, -32700, "parse error");
    };
    let id = request.get("id").cloned().unwrap_or(Value::Null);
    let Some(method) = request["method"].as_str() else {
        return failure(&id, -32600, "invalid request");
    };
    let params = &request["params"];
    let outcome: Result<Value, (i64, String)> = match method {
        "reload" => host
            .reload()
            .map(|()| json!({ "reloaded": true }))
            .map_err(|e| (-32000, e)),
        "app_source" => match params.get("set") {
            None | Some(Value::Null) => Ok(host.app_source()),
            Some(Value::String(text)) => host.set_app_source(text).map_err(|e| (-32000, e)),
            Some(_) => Err((-32602, "set must be a string".to_string())),
        },
        "screenshot" => host
            .screenshot()
            .map(|png| {
                json!({
                    "format": "png",
                    "base64": base64::engine::general_purpose::STANDARD.encode(png),
                })
            })
            .map_err(|e| (-32000, e)),
        "logs_tail" => {
            let file = params["file"].as_str().unwrap_or("shell");
            let lines = params["lines"].as_u64().unwrap_or(100) as usize;
            host.logs_tail(file, lines)
                .map(|lines| json!({ "file": file, "lines": lines }))
                .map_err(|e| (-32000, e))
        }
        "focus" => {
            host.focus();
            Ok(json!({ "focused": true }))
        }
        "second_instance" => match params["argv"]
            .as_array()
            .map(|a| a.iter().map(|v| v.as_str().map(str::to_string)).collect::<Option<Vec<_>>>())
        {
            Some(Some(argv)) => {
                host.second_instance(argv);
                Ok(json!({ "accepted": true }))
            }
            _ => Err((-32602, "argv must be a list of strings".to_string())),
        },
        _ => Err((-32601, format!("unknown method {method}"))),
    };
    match outcome {
        Ok(result) => success(&id, result),
        Err((code, message)) => failure(&id, code, &message),
    }
}

async fn serve_stream<S>(host: Arc<dyn Host>, stream: S)
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let (reader, mut writer) = tokio::io::split(stream);
    let mut reader = BufReader::new(reader);
    loop {
        let mut line = String::new();
        match (&mut reader).take(MAX_REQUEST).read_line(&mut line).await {
            Ok(0) | Err(_) => return,
            Ok(_) => {}
        }
        let worker = Arc::clone(&host);
        let reply = tokio::task::spawn_blocking(move || dispatch(&*worker, line.trim()))
            .await
            .unwrap_or_else(|_| failure(&Value::Null, -32603, "internal error"));
        let mut text = reply.to_string();
        text.push('\n');
        if writer.write_all(text.as_bytes()).await.is_err() || writer.flush().await.is_err() {
            return;
        }
    }
}

#[cfg(unix)]
pub fn start(paths: &Paths, host: Arc<dyn Host>) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let path = paths.shell_sock();
    let _ = std::fs::remove_file(&path);
    let listener = tauri::async_runtime::block_on(async { tokio::net::UnixListener::bind(&path) })?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    tauri::async_runtime::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            tauri::async_runtime::spawn(serve_stream(Arc::clone(&host), stream));
        }
    });
    Ok(())
}

#[cfg(windows)]
pub fn start(paths: &Paths, host: Arc<dyn Host>) -> io::Result<()> {
    use tokio::net::windows::named_pipe::ServerOptions;
    let name = format!(r"\\.\pipe\dou-shell-{}", uuid::Uuid::new_v4().simple());
    let first = tauri::async_runtime::block_on(async {
        ServerOptions::new()
            .first_pipe_instance(true)
            .reject_remote_clients(true)
            .create(&name)
    })?;
    std::fs::write(paths.shell_pipe(), &name)?;
    tauri::async_runtime::spawn(async move {
        let mut next = first;
        loop {
            if next.connect().await.is_err() {
                return;
            }
            let connected = next;
            next = match ServerOptions::new().reject_remote_clients(true).create(&name) {
                Ok(server) => server,
                Err(_) => return,
            };
            tauri::async_runtime::spawn(serve_stream(Arc::clone(&host), connected));
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Fake {
        calls: Mutex<Vec<String>>,
    }

    impl Host for Fake {
        fn reload(&self) -> Result<(), String> {
            self.calls.lock().expect("lock").push("reload".into());
            Ok(())
        }
        fn app_source(&self) -> Value {
            json!({ "source": null, "url": "https://x.test" })
        }
        fn set_app_source(&self, text: &str) -> Result<Value, String> {
            if text == "bad" {
                Err("refused".into())
            } else {
                Ok(json!({ "restarting": true, "source": text }))
            }
        }
        fn screenshot(&self) -> Result<Vec<u8>, String> {
            Ok(vec![0x89, b'P', b'N', b'G'])
        }
        fn logs_tail(&self, file: &str, lines: usize) -> Result<Vec<String>, String> {
            Ok(vec![format!("{file}:{lines}")])
        }
        fn focus(&self) {
            self.calls.lock().expect("lock").push("focus".into());
        }
        fn second_instance(&self, argv: Vec<String>) {
            self.calls.lock().expect("lock").push(format!("second:{}", argv.join(",")));
        }
    }

    fn ask(host: &Fake, request: Value) -> Value {
        dispatch(host, &request.to_string())
    }

    #[test]
    fn every_method_answers_json_rpc() {
        let host = Fake::default();
        let reply = ask(&host, json!({ "jsonrpc": "2.0", "id": 7, "method": "reload" }));
        assert_eq!(reply["id"], 7);
        assert_eq!(reply["result"]["reloaded"], true);
        let get = ask(&host, json!({ "id": 1, "method": "app_source" }));
        assert_eq!(get["result"]["url"], "https://x.test");
        let set = ask(&host, json!({ "id": 1, "method": "app_source", "params": { "set": "./dist" } }));
        assert_eq!(set["result"]["restarting"], true);
        let shot = ask(&host, json!({ "id": 1, "method": "screenshot" }));
        assert_eq!(shot["result"]["format"], "png");
        assert_eq!(shot["result"]["base64"], "iVBORw==");
        let tail = ask(&host, json!({ "id": 1, "method": "logs_tail", "params": { "file": "webview", "lines": 5 } }));
        assert_eq!(tail["result"]["lines"][0], "webview:5");
        let default_tail = ask(&host, json!({ "id": 1, "method": "logs_tail" }));
        assert_eq!(default_tail["result"]["lines"][0], "shell:100");
    }

    #[test]
    fn bad_input_gets_a_json_rpc_error() {
        let host = Fake::default();
        assert_eq!(dispatch(&host, "{ nope")["error"]["code"], -32700);
        assert_eq!(ask(&host, json!({ "id": 1 }))["error"]["code"], -32600);
        assert_eq!(ask(&host, json!({ "id": 1, "method": "nope" }))["error"]["code"], -32601);
        assert_eq!(
            ask(&host, json!({ "id": 1, "method": "app_source", "params": { "set": 5 } }))["error"]["code"],
            -32602
        );
        let refused = ask(&host, json!({ "id": 1, "method": "app_source", "params": { "set": "bad" } }));
        assert_eq!(refused["error"]["message"], "refused");
    }

    #[test]
    fn a_second_instance_hands_over_its_arguments() {
        let host = Fake::default();
        let reply = ask(&host, json!({ "id": 1, "method": "second_instance", "params": { "argv": ["a", "chatic://x"] } }));
        assert_eq!(reply["result"]["accepted"], true);
        assert_eq!(host.calls.lock().expect("lock").as_slice(), ["second:a,chatic://x"]);
        let bad = ask(&host, json!({ "id": 1, "method": "second_instance", "params": { "argv": [1] } }));
        assert_eq!(bad["error"]["code"], -32602);
    }

    #[cfg(unix)]
    #[test]
    fn the_socket_is_private_and_answers_a_client() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().expect("temp dir");
        let paths = Paths::prepare(&dir.path().join("p")).expect("prepare");
        start(&paths, Arc::new(Fake::default())).expect("start");
        let mode = std::fs::metadata(paths.shell_sock()).expect("meta").permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        let reply = crate::shell_client::call(&paths, "focus", json!({})).expect("call");
        assert_eq!(reply["focused"], true);
        let error = crate::shell_client::call(&paths, "nope", json!({})).expect_err("unknown");
        assert!(error.contains("unknown method"));
    }
}
