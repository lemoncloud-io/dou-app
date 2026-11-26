use std::sync::Arc;
use std::time::Duration;

use dou_core::Result;
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;

use crate::tools::{find, tool_list};
use crate::untrusted::{UNTRUSTED_NOTICE, wrap_untrusted};

const EVENTS_URI: &str = "dou://events";
const PROTOCOL: &str = "2024-11-05";

fn reply(id: &Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn failure(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn tool_result(value: &Value, is_error: bool) -> Value {
    let text = serde_json::to_string_pretty(value).unwrap_or_default();
    json!({ "content": [{ "type": "text", "text": text }], "isError": is_error })
}

async fn control(name: &str, method: &str, params: Value) -> std::result::Result<Value, Value> {
    match dou_control::call(name, method, params).await {
        Ok(answer) => answer,
        Err(error) => Err(
            json!({ "code": "app_not_running", "message": format!("The DoU app is not running or not reachable: {error}") }),
        ),
    }
}

async fn call_tool(name: &str, params: &Value) -> Value {
    let Some(tool) = find(params["name"].as_str().unwrap_or_default()) else {
        return tool_result(
            &json!({ "error": { "code": "unknown_tool", "message": "no such tool" } }),
            true,
        );
    };
    let arguments = params.get("arguments").cloned().unwrap_or(Value::Null);
    match control(name, tool.method, arguments).await {
        Ok(mut result) => {
            wrap_untrusted(&mut result);
            let body = json!({ "notice": UNTRUSTED_NOTICE, "result": result });
            tool_result(&body, false)
        }
        Err(error) => tool_result(&json!({ "error": error }), true),
    }
}

async fn handle(
    name: &str,
    request: &Value,
    subscribe: &mpsc::UnboundedSender<()>,
) -> Option<Value> {
    let id = request.get("id")?;
    let method = request["method"].as_str().unwrap_or_default();
    Some(match method {
        "initialize" => reply(
            id,
            json!({
                "protocolVersion": request["params"]["protocolVersion"].as_str().unwrap_or(PROTOCOL),
                "capabilities": { "tools": {}, "resources": { "subscribe": true } },
                "serverInfo": { "name": "dou-native", "version": env!("CARGO_PKG_VERSION") },
            }),
        ),
        "ping" => reply(id, json!({})),
        "tools/list" => reply(id, json!({ "tools": tool_list() })),
        "tools/call" => reply(id, call_tool(name, &request["params"]).await),
        "resources/list" => reply(
            id,
            json!({ "resources": [{ "uri": EVENTS_URI, "name": "Incoming events", "mimeType": "application/json" }] }),
        ),
        "resources/read" => {
            if request["params"]["uri"] != EVENTS_URI {
                return Some(failure(id, -32002, "unknown resource"));
            }
            match control(name, "events_list", json!({ "tail": true, "limit": 50 })).await {
                Ok(mut events) => {
                    wrap_untrusted(&mut events);
                    reply(
                        id,
                        json!({ "contents": [{ "uri": EVENTS_URI, "mimeType": "application/json", "text": events.to_string() }] }),
                    )
                }
                Err(error) => failure(id, -32000, error["message"].as_str().unwrap_or("denied")),
            }
        }
        "resources/subscribe" => {
            let _ = subscribe.send(());
            reply(id, json!({}))
        }
        "resources/unsubscribe" => reply(id, json!({})),
        _ => failure(id, -32601, "method not found"),
    })
}

pub async fn run<I, O>(input: I, output: O, name: String) -> Result<()>
where
    I: AsyncRead + Unpin,
    O: AsyncWrite + Unpin + Send + 'static,
{
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Value>();
    let writer = tokio::spawn(async move {
        let mut output = output;
        while let Some(message) = out_rx.recv().await {
            if output
                .write_all(format!("{message}\n").as_bytes())
                .await
                .is_err()
                || output.flush().await.is_err()
            {
                break;
            }
        }
    });

    let (subscribe_tx, mut subscribe_rx) = mpsc::unbounded_channel::<()>();
    let watcher_name = Arc::new(name.clone());
    let watcher_out = out_tx.clone();
    let watcher = tokio::spawn(async move {
        if subscribe_rx.recv().await.is_none() {
            return;
        }
        let mut cursor = 0;
        if let Ok(latest) = control(
            &watcher_name,
            "events_list",
            json!({ "since": i64::MAX - 1 }),
        )
        .await
        {
            cursor = latest["cursor"].as_i64().unwrap_or(0);
        }
        loop {
            match control(
                &watcher_name,
                "events_wait",
                json!({ "since": cursor, "timeoutMs": 30000 }),
            )
            .await
            {
                Ok(found) => {
                    let next = found["cursor"].as_i64().unwrap_or(cursor);
                    if next != cursor {
                        cursor = next;
                        let note = json!({ "jsonrpc": "2.0", "method": "notifications/resources/updated", "params": { "uri": EVENTS_URI } });
                        if watcher_out.send(note).is_err() {
                            return;
                        }
                    }
                }
                Err(_) => tokio::time::sleep(Duration::from_secs(5)).await,
            }
        }
    });

    let mut lines = BufReader::new(input).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Value>(&line) {
            Ok(request) => handle(&name, &request, &subscribe_tx).await,
            Err(_) => Some(failure(&Value::Null, -32700, "parse error")),
        };
        if let Some(response) = response
            && out_tx.send(response).is_err()
        {
            break;
        }
    }
    watcher.abort();
    drop(out_tx);
    let _ = writer.await;
    Ok(())
}
