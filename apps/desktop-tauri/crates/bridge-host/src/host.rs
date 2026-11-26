use std::collections::HashMap;
use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use serde_json::{Map, Value, json};

use crate::ids::next_id;
use crate::response_types::{RESPONSE_TYPES, response_type};

pub const NON_READINESS_MESSAGE_TYPES: &[&str] = &[
    "SendLog",
    "StorageGet",
    "StorageSave",
    "StorageClear",
    "RuntimeHello",
    "RuntimeCall",
    "RuntimeSubscribe",
    "RuntimeUnsubscribe",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HandlerError {
    pub code: String,
    pub message: String,
}

impl HandlerError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.to_string(),
            message: message.to_string(),
        }
    }
}

pub type HandlerFuture = Pin<Box<dyn Future<Output = Result<Option<Value>, HandlerError>> + Send>>;
pub type Handler = Arc<dyn Fn(Value) -> HandlerFuture + Send + Sync>;

pub struct Config {
    pub version: String,
    pub send_to_web: Arc<dyn Fn(String) + Send + Sync>,
    pub sub_webview_open_scope: Option<String>,
}

struct Ready {
    is_ready: bool,
    buffer: VecDeque<String>,
}

pub struct BridgeHost {
    version: String,
    send_to_web: Arc<dyn Fn(String) + Send + Sync>,
    sub_webview_open_scope: Option<String>,
    handlers: HashMap<String, Handler>,
    order: Vec<String>,
    ready: Mutex<Ready>,
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl BridgeHost {
    pub fn new(config: Config) -> Self {
        let mut host = Self {
            version: config.version,
            send_to_web: config.send_to_web,
            sub_webview_open_scope: config.sub_webview_open_scope,
            handlers: HashMap::new(),
            order: Vec::new(),
            ready: Mutex::new(Ready {
                is_ready: false,
                buffer: VecDeque::new(),
            }),
        };
        host.register("WebAppReady", Arc::new(|_| Box::pin(async { Ok(None) })));
        host.register("Ping", Arc::new(|_| Box::pin(async { Ok(None) })));
        host
    }

    pub fn register(&mut self, request_type: &str, handler: Handler) {
        if self
            .handlers
            .insert(request_type.to_string(), handler)
            .is_none()
        {
            self.order.push(request_type.to_string());
        }
    }

    pub fn registered(&self) -> &[String] {
        &self.order
    }

    pub fn push_event(&self, event_type: &str, data: Value) {
        let message = json!({
            "type": event_type,
            "data": data,
            "version": self.version,
            "refId": next_id(),
        })
        .to_string();
        let mut state = lock(&self.ready);
        if state.is_ready {
            drop(state);
            (self.send_to_web)(message);
        } else {
            state.buffer.push_back(message);
        }
    }

    pub async fn handle_message(&self, raw: &str) {
        let Ok(Value::Object(request)) = serde_json::from_str::<Value>(raw) else {
            return;
        };
        let Some(request_type) = request.get("type").and_then(Value::as_str) else {
            return;
        };
        let request_type = request_type.to_string();
        if !NON_READINESS_MESSAGE_TYPES.contains(&request_type.as_str()) {
            self.mark_ready();
        }
        self.process(&request_type, request).await;
    }

    fn mark_ready(&self) {
        let pending: Vec<String> = {
            let mut state = lock(&self.ready);
            if state.is_ready {
                return;
            }
            state.is_ready = true;
            state.buffer.drain(..).collect()
        };
        for message in pending {
            (self.send_to_web)(message);
        }
    }

    async fn process(&self, request_type: &str, request: Map<String, Value>) {
        let Some(handler) = self.handlers.get(request_type) else {
            self.send_error(
                &request,
                request_type,
                "NOT_FOUND",
                &format!("No handler registered for message type: {request_type}"),
                "No handler is registered for the incoming WebMessage type.",
                true,
                None,
            );
            return;
        };
        let outcome = match request_type {
            "WebAppReady" => Ok(Some(self.web_app_ready(&request))),
            "Ping" => Ok(Some(pong(&request))),
            _ => handler(Value::Object(request.clone())).await,
        };
        match outcome {
            Ok(None) => {}
            Ok(Some(Value::Object(mut response))) => {
                response.insert(
                    "refId".into(),
                    request.get("refId").cloned().unwrap_or(Value::Null),
                );
                response.insert(
                    "version".into(),
                    request.get("version").cloned().unwrap_or(Value::Null),
                );
                (self.send_to_web)(Value::Object(response).to_string());
            }
            Ok(Some(_)) => {}
            Err(error) => self.send_error(
                &request,
                request_type,
                &error.code,
                &error.message,
                "A registered native handler threw an uncaught exception.",
                false,
                Some(json!({})),
            ),
        }
    }

    fn web_app_ready(&self, request: &Map<String, Value>) -> Value {
        let supported_web: Vec<&String> = self.order.iter().collect();
        let mut supported_app: Vec<&str> = Vec::new();
        for name in &supported_web {
            if let Some(response) = response_type(name)
                && !supported_app.contains(&response)
            {
                supported_app.push(response);
            }
        }
        let protocol_version = request
            .get("version")
            .cloned()
            .unwrap_or_else(|| Value::String(self.version.clone()));
        let mut data = json!({
            "appVersion": self.version,
            "protocolVersion": protocol_version,
            "supportedWebMessages": supported_web,
            "supportedAppMessages": supported_app,
        });
        if let (Some(scope), Some(map)) = (&self.sub_webview_open_scope, data.as_object_mut()) {
            map.insert("subWebViewOpenScope".into(), Value::String(scope.clone()));
        }
        json!({ "type": "OnWebAppReady", "success": true, "data": data })
    }

    #[allow(clippy::too_many_arguments)]
    fn send_error(
        &self,
        request: &Map<String, Value>,
        request_type: &str,
        code: &str,
        message: &str,
        reason: &str,
        recoverable: bool,
        details: Option<Value>,
    ) {
        let mut error = Map::new();
        error.insert("code".into(), code.into());
        error.insert("message".into(), message.into());
        error.insert("traceId".into(), next_id().into());
        error.insert("requestType".into(), request_type.into());
        if let Some(expected) = response_type(request_type) {
            error.insert("expectedResponseType".into(), expected.into());
        }
        error.insert(
            "protocolVersion".into(),
            request
                .get("version")
                .cloned()
                .unwrap_or_else(|| Value::String(self.version.clone())),
        );
        error.insert("appVersion".into(), self.version.clone().into());
        error.insert("reason".into(), reason.into());
        if let Some(details) = details {
            error.insert("details".into(), details);
        }
        error.insert("recoverable".into(), recoverable.into());
        let response = json!({
            "type": "ERROR",
            "refId": request.get("refId").cloned().unwrap_or(Value::Null),
            "version": request.get("version").cloned().unwrap_or(Value::Null),
            "nonce": request.get("nonce").cloned().unwrap_or(Value::Null),
            "success": false,
            "error": Value::Object(error),
        });
        (self.send_to_web)(response.to_string());
    }

    pub fn known_request_types() -> impl Iterator<Item = &'static str> {
        RESPONSE_TYPES.iter().map(|(name, _)| *name)
    }
}

fn pong(request: &Map<String, Value>) -> Value {
    let payload = request
        .get("data")
        .and_then(|data| data.get("payload"))
        .cloned()
        .unwrap_or_else(|| Value::String(String::new()));
    json!({ "type": "Pong", "success": true, "data": { "payload": payload } })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::BRIDGE_VERSION;

    fn host_with_log() -> (BridgeHost, Arc<Mutex<Vec<Value>>>) {
        let log: Arc<Mutex<Vec<Value>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&log);
        let host = BridgeHost::new(Config {
            version: BRIDGE_VERSION.to_string(),
            send_to_web: Arc::new(move |message| {
                if let Ok(value) = serde_json::from_str(&message) {
                    lock(&sink).push(value);
                }
            }),
            sub_webview_open_scope: Some("anyHttps".into()),
        });
        (host, log)
    }

    fn request(request_type: &str, ref_id: &str, data: Value) -> String {
        json!({ "type": request_type, "refId": ref_id, "version": BRIDGE_VERSION, "data": data })
            .to_string()
    }

    #[tokio::test]
    async fn events_wait_for_web_app_ready_and_flush_before_its_reply() {
        let (host, log) = host_with_log();
        host.push_event("OnBackPressed", json!({}));
        assert!(lock(&log).is_empty());

        host.handle_message(&request("WebAppReady", "123", json!({})))
            .await;

        let sent = lock(&log);
        assert_eq!(sent.len(), 2);
        assert_eq!(sent[0]["type"], "OnBackPressed");
        assert_eq!(sent[1]["type"], "OnWebAppReady");
        assert_eq!(sent[1]["refId"], "123");
        assert_eq!(sent[1]["success"], true);
        assert_eq!(sent[1]["data"]["appVersion"], BRIDGE_VERSION);
        assert_eq!(sent[1]["data"]["protocolVersion"], BRIDGE_VERSION);
        assert_eq!(sent[1]["data"]["subWebViewOpenScope"], "anyHttps");
        let web = sent[1]["data"]["supportedWebMessages"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        assert!(web.contains(&json!("WebAppReady")) && web.contains(&json!("Ping")));
        let app = sent[1]["data"]["supportedAppMessages"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        assert!(app.contains(&json!("OnWebAppReady")) && app.contains(&json!("Pong")));
    }

    #[tokio::test]
    async fn events_pushed_after_ready_go_out_at_once() {
        let (host, log) = host_with_log();
        host.handle_message(&request("Ping", "p", json!({}))).await;
        host.push_event("OnBackPressed", json!({}));
        assert_eq!(lock(&log).len(), 2);
    }

    #[tokio::test]
    async fn storage_and_log_requests_do_not_make_the_page_ready() {
        let (host, log) = host_with_log();
        host.push_event("OnBackPressed", json!({}));
        host.handle_message(&request("StorageGet", "s", json!({})))
            .await;
        assert_eq!(lock(&log).len(), 1);
        assert_eq!(lock(&log)[0]["type"], "ERROR");
    }

    #[tokio::test]
    async fn ping_answers_pong_with_its_payload() {
        let (host, log) = host_with_log();
        host.handle_message(&request("Ping", "p1", json!({ "payload": "hi" })))
            .await;
        let sent = lock(&log);
        assert_eq!(sent[0]["type"], "Pong");
        assert_eq!(sent[0]["data"]["payload"], "hi");
        assert_eq!(sent[0]["refId"], "p1");
    }

    #[tokio::test]
    async fn an_unknown_type_is_answered_not_found_with_the_request_fields() {
        let (host, log) = host_with_log();
        let raw = json!({ "type": "OpenCamera", "refId": "r", "version": "9.9.9", "nonce": "n", "data": {} }).to_string();
        host.handle_message(&raw).await;
        let sent = lock(&log);
        let reply = &sent[0];
        assert_eq!(reply["type"], "ERROR");
        assert_eq!(reply["success"], false);
        assert_eq!(reply["refId"], "r");
        assert_eq!(reply["nonce"], "n");
        assert_eq!(reply["error"]["code"], "NOT_FOUND");
        assert_eq!(reply["error"]["requestType"], "OpenCamera");
        assert_eq!(reply["error"]["expectedResponseType"], "OnOpenCamera");
        assert_eq!(reply["error"]["protocolVersion"], "9.9.9");
        assert_eq!(reply["error"]["recoverable"], true);
    }

    #[tokio::test]
    async fn a_handler_result_gets_the_request_ref_id_and_version() {
        let (mut host, log) = host_with_log();
        host.register(
            "SavePreference",
            Arc::new(|message| {
                Box::pin(async move {
                    let key = message["data"]["key"].clone();
                    Ok(Some(json!({ "type": "OnSavePreference", "success": true, "data": { "key": key, "success": true } })))
                })
            }),
        );
        host.handle_message(&request("SavePreference", "sp", json!({ "key": "theme" })))
            .await;
        let sent = lock(&log);
        assert_eq!(sent[0]["type"], "OnSavePreference");
        assert_eq!(sent[0]["refId"], "sp");
        assert_eq!(sent[0]["version"], BRIDGE_VERSION);
        assert_eq!(sent[0]["data"]["key"], "theme");
    }

    #[tokio::test]
    async fn a_failing_handler_is_answered_with_its_code_and_not_recoverable() {
        let (mut host, log) = host_with_log();
        host.register(
            "FetchFcmToken",
            Arc::new(|_| Box::pin(async { Err(HandlerError::new("BOOM", "it broke")) })),
        );
        host.handle_message(&request("FetchFcmToken", "f", json!({})))
            .await;
        let sent = lock(&log);
        assert_eq!(sent[0]["error"]["code"], "BOOM");
        assert_eq!(sent[0]["error"]["message"], "it broke");
        assert_eq!(sent[0]["error"]["recoverable"], false);
    }

    #[tokio::test]
    async fn malformed_input_is_dropped_without_an_answer() {
        let (host, log) = host_with_log();
        host.handle_message("not json").await;
        host.handle_message("[1,2]").await;
        host.handle_message(&json!({ "refId": "x" }).to_string())
            .await;
        assert!(lock(&log).is_empty());
    }
}
