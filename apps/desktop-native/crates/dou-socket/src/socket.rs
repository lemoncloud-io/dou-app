use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use dou_core::{Error, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::protocol::Message;

use crate::frame::{Incoming, encode_request, parse_incoming};
use crate::mid::build_mid;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const PING_INTERVAL: Duration = Duration::from_secs(30);
const MAX_PENDING: usize = 512;

type Pending = Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value>>>>>;

#[derive(Clone)]
pub struct Socket {
    outgoing: mpsc::UnboundedSender<String>,
    pending: Pending,
    events: broadcast::Sender<(String, Value)>,
    closed: tokio::sync::watch::Sender<bool>,
}

fn ws_error(error: impl std::fmt::Display) -> Error {
    Error::Network(error.to_string())
}

impl Socket {
    pub async fn connect(url: &str, user_agent: &str) -> Result<Self> {
        let full = if url.contains('?') {
            format!("{url}&v2=")
        } else {
            format!("{url}?v2=")
        };
        let mut request = full.into_client_request().map_err(ws_error)?;
        request.headers_mut().insert(
            "User-Agent",
            HeaderValue::from_str(user_agent).map_err(ws_error)?,
        );
        let (stream, _) = tokio::time::timeout(Duration::from_secs(10), connect_async(request))
            .await
            .map_err(|_| Error::Network("408 CONNECT TIMEOUT".into()))?
            .map_err(ws_error)?;
        let (mut sink, mut source) = stream.split();

        let (outgoing, mut queue) = mpsc::unbounded_channel::<String>();
        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
        let (events, _) = broadcast::channel(1024);
        let (closed, _) = tokio::sync::watch::channel(false);

        tokio::spawn(async move {
            while let Some(text) = queue.recv().await {
                if sink.send(Message::text(text)).await.is_err() {
                    break;
                }
            }
            let _ = sink.close().await;
        });

        let reader_pending = Arc::clone(&pending);
        let reader_events = events.clone();
        let reader_closed = closed.clone();
        tokio::spawn(async move {
            while let Some(Ok(message)) = source.next().await {
                let Message::Text(text) = message else {
                    continue;
                };
                match parse_incoming(text.as_str()) {
                    Ok(Incoming::Ok { mid, data, .. }) => settle(&reader_pending, &mid, Ok(data)),
                    Ok(Incoming::Failed {
                        mid, error, code, ..
                    }) => settle(
                        &reader_pending,
                        &mid,
                        Err(match code {
                            Some(status) if (400..600).contains(&status) => Error::Http {
                                status: u16::try_from(status).unwrap_or(500),
                                message: error,
                            },
                            _ => Error::Network(error),
                        }),
                    ),
                    Ok(Incoming::Event { ty, data }) => {
                        let _ = reader_events.send((ty, data));
                    }
                    Err(_) => {}
                }
            }
            let waiting: Vec<_> = reader_pending
                .lock()
                .map(|mut map| map.drain().collect())
                .unwrap_or_default();
            for (_, sender) in waiting {
                let _ = sender.send(Err(Error::Network("socket closed".into())));
            }
            reader_closed.send_replace(true);
        });

        let socket = Self {
            outgoing,
            pending,
            events,
            closed,
        };
        socket.spawn_keepalive();
        Ok(socket)
    }

    fn spawn_keepalive(&self) {
        let socket = self.clone();
        tokio::spawn(async move {
            let mut missed = 0;
            loop {
                tokio::select! {
                    () = tokio::time::sleep(PING_INTERVAL) => {}
                    () = socket.closed() => return,
                }
                let ping = tokio::time::timeout(
                    Duration::from_secs(10),
                    socket.request("system.ping", None, None),
                )
                .await;
                match ping {
                    Ok(Ok(_)) => missed = 0,
                    Ok(Err(_)) | Err(_) => {
                        missed += 1;
                        if missed >= 2 {
                            return;
                        }
                    }
                }
            }
        });
    }

    pub async fn request(
        &self,
        ty: &str,
        data: Option<&Value>,
        as_user: Option<&str>,
    ) -> Result<Value> {
        let mid = build_mid();
        let (reply, answer) = oneshot::channel();
        {
            let mut pending = self
                .pending
                .lock()
                .map_err(|_| Error::Network("socket state poisoned".into()))?;
            if pending.len() >= MAX_PENDING {
                return Err(Error::Http {
                    status: 429,
                    message: "pending queue full".into(),
                });
            }
            pending.insert(mid.clone(), reply);
        }
        let text = encode_request(ty, data, &mid, as_user);
        if self.outgoing.send(text).is_err() {
            self.forget(&mid);
            return Err(Error::Network("socket closed".into()));
        }
        match tokio::time::timeout(REQUEST_TIMEOUT, answer).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(Error::Network("socket closed".into())),
            Err(_) => {
                self.forget(&mid);
                Err(Error::Http {
                    status: 408,
                    message: format!("REQUEST TIMEOUT - {ty}[{mid}]"),
                })
            }
        }
    }

    fn forget(&self, mid: &str) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(mid);
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<(String, Value)> {
        self.events.subscribe()
    }

    pub async fn closed(&self) {
        let mut watcher = self.closed.subscribe();
        let _ = watcher.wait_for(|closed| *closed).await;
    }
}

fn settle(pending: &Pending, mid: &str, result: Result<Value>) {
    let sender = pending.lock().ok().and_then(|mut map| map.remove(mid));
    if let Some(sender) = sender {
        let _ = sender.send(result);
    }
}
