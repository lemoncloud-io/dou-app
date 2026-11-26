use std::time::Duration;

use dou_core::{Error, Result};

use crate::classify::{Failure, classify};
use crate::request::BuiltRequest;

const MAX_RETRIES: u32 = 4;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub struct HttpClient {
    inner: reqwest::Client,
    retry_unit: Duration,
}

impl HttpClient {
    pub fn new(user_agent: &str) -> Result<Self> {
        let inner = reqwest::Client::builder()
            .user_agent(user_agent)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|e| Error::Network(e.to_string()))?;
        Ok(Self {
            inner,
            retry_unit: Duration::from_secs(1),
        })
    }

    pub fn with_retry_unit(mut self, unit: Duration) -> Self {
        self.retry_unit = unit;
        self
    }

    pub async fn execute(&self, request: &BuiltRequest) -> Result<serde_json::Value> {
        let mut attempt = 0;
        loop {
            match self.send_once(request).await {
                Ok(value) => return Ok(value),
                Err(error) => {
                    let failure = failure_of(&error);
                    if !classify(&failure).should_retry || attempt >= MAX_RETRIES {
                        return Err(error);
                    }
                    tokio::time::sleep(self.retry_unit * 2u32.pow(attempt)).await;
                    attempt += 1;
                }
            }
        }
    }

    async fn send_once(&self, request: &BuiltRequest) -> Result<serde_json::Value> {
        let method = reqwest::Method::from_bytes(request.method.to_ascii_uppercase().as_bytes())
            .map_err(|e| Error::Network(e.to_string()))?;
        let mut builder = self.inner.request(method, &request.url);
        for (name, value) in &request.headers {
            builder = builder.header(name, value);
        }
        if let Some(body) = &request.body {
            builder = builder.body(body.clone());
        }
        let response = builder
            .send()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;
        let status = response.status().as_u16();
        let text = response
            .text()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;
        if status >= 400 {
            return Err(Error::Http {
                status,
                message: error_message(&text),
            });
        }
        if text.trim().is_empty() {
            return Ok(serde_json::Value::Null);
        }
        serde_json::from_str(&text).map_err(|e| Error::InvalidResponse(e.to_string()))
    }
}

fn error_message(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("error")
                .or_else(|| v.get("message"))
                .and_then(|m| m.as_str().map(str::to_string))
        })
        .unwrap_or_else(|| body.chars().take(200).collect())
}

fn failure_of(error: &Error) -> Failure {
    match error {
        Error::Http { status, message } => Failure {
            status: Some(*status),
            message: message.clone(),
            network: false,
        },
        Error::Network(message) => Failure {
            status: None,
            message: message.clone(),
            network: true,
        },
        other => Failure {
            status: None,
            message: other.to_string(),
            network: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;
    use crate::request::{Method, RequestSpec, build_request};

    fn serve(responses: Vec<(u16, &'static str)>) -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/x", listener.local_addr().unwrap());
        let hits = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&hits);
        std::thread::spawn(move || {
            for (status, body) in responses {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let mut buffer = [0u8; 4096];
                let _ = stream.read(&mut buffer);
                counter.fetch_add(1, Ordering::SeqCst);
                let reply = format!(
                    "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(reply.as_bytes());
            }
        });
        (url, hits)
    }

    fn get(url: String) -> BuiltRequest {
        build_request(
            &RequestSpec {
                method: Method::Get,
                base_url: url,
                params: vec![],
                body: None,
            },
            None,
            "2026-11-26T00:00:00.000Z",
        )
        .unwrap()
    }

    fn client() -> HttpClient {
        HttpClient::new("test-agent/1.0")
            .unwrap()
            .with_retry_unit(Duration::from_millis(1))
    }

    #[tokio::test]
    async fn a_5xx_is_retried_until_it_succeeds() {
        let (url, hits) = serve(vec![(503, "{}"), (502, "{}"), (200, r#"{"ok":true}"#)]);
        let value = client().execute(&get(url)).await.unwrap();
        assert_eq!(value["ok"], true);
        assert_eq!(hits.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn a_4xx_fails_at_once_with_the_server_message() {
        let (url, hits) = serve(vec![(404, r#"{"error":"no such pairing"}"#), (200, "{}")]);
        let error = client().execute(&get(url)).await.unwrap_err();
        assert_eq!(
            error,
            Error::Http {
                status: 404,
                message: "no such pairing".into()
            }
        );
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }
}
