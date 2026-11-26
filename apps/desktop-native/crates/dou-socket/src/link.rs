use std::future::Future;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use dou_core::{Error, Result};
use serde_json::Value;
use tokio::sync::broadcast;

use crate::handshake::Authenticated;
use crate::socket::Socket;

const BASE_DELAY_MS: u64 = 500;
const MAX_DELAY_MS: u64 = 30_000;
const STABLE_AFTER: Duration = Duration::from_secs(5);

pub fn backoff_ms(attempt: u32, jitter_unit: f64) -> u64 {
    let base = (BASE_DELAY_MS.saturating_mul(1u64 << attempt.min(16))).min(MAX_DELAY_MS);
    let spread = 1.0 + (jitter_unit.clamp(0.0, 1.0) * 2.0 - 1.0) * 0.3;
    (base as f64 * spread).round() as u64
}

fn jitter() -> f64 {
    f64::from(uuid::Uuid::new_v4().as_bytes()[0]) / 255.0
}

#[derive(Clone)]
pub struct Link {
    current: Arc<RwLock<Option<(u64, Socket)>>>,
    events: broadcast::Sender<(String, Value)>,
    connected: tokio::sync::watch::Sender<Option<Value>>,
}

impl Link {
    pub fn start<F, Fut>(connect: F) -> Self
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<Authenticated>> + Send + 'static,
    {
        let (events, _) = broadcast::channel(1024);
        let (connected, _) = tokio::sync::watch::channel(None);
        let link = Self {
            current: Arc::new(RwLock::new(None)),
            events,
            connected,
        };
        let supervisor = link.clone();
        tokio::spawn(async move {
            let mut attempt = 0u32;
            let mut generation = 0u64;
            loop {
                match connect().await {
                    Ok(open) => {
                        generation += 1;
                        let started = tokio::time::Instant::now();
                        supervisor.attach(generation, &open);
                        open.socket.closed().await;
                        supervisor.detach(generation);
                        attempt = if started.elapsed() >= STABLE_AFTER {
                            0
                        } else {
                            attempt + 1
                        };
                    }
                    Err(_) => attempt += 1,
                }
                tokio::time::sleep(Duration::from_millis(backoff_ms(attempt, jitter()))).await;
            }
        });
        link
    }

    fn attach(&self, generation: u64, open: &Authenticated) {
        let mut incoming = open.socket.subscribe();
        let events = self.events.clone();
        tokio::spawn(async move {
            while let Ok(item) = incoming.recv().await {
                let _ = events.send(item);
            }
        });
        if let Ok(mut current) = self.current.write() {
            *current = Some((generation, open.socket.clone()));
        }
        self.connected.send_replace(Some(open.state.clone()));
    }

    fn detach(&self, generation: u64) {
        if let Ok(mut current) = self.current.write()
            && current
                .as_ref()
                .is_some_and(|(held, _)| *held == generation)
        {
            *current = None;
        }
        self.connected.send_replace(None);
    }

    pub fn socket(&self) -> Option<Socket> {
        self.current
            .read()
            .ok()?
            .as_ref()
            .map(|(_, socket)| socket.clone())
    }

    pub async fn request(&self, ty: &str, data: Option<&Value>) -> Result<Value> {
        let socket = self
            .socket()
            .ok_or_else(|| Error::Network("not connected".into()))?;
        socket.request(ty, data, None).await
    }

    pub fn subscribe(&self) -> broadcast::Receiver<(String, Value)> {
        self.events.subscribe()
    }

    pub async fn wait_connected(&self, timeout: Duration) -> Result<Value> {
        let mut watcher = self.connected.subscribe();
        let wait = watcher.wait_for(Option::is_some);
        match tokio::time::timeout(timeout, wait).await {
            Ok(Ok(state)) => Ok(state.clone().unwrap_or(Value::Null)),
            _ => Err(Error::Network("408 CONNECT TIMEOUT".into())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_delay_doubles_from_half_a_second_and_stops_at_thirty() {
        let delays: Vec<u64> = (0..8).map(|n| backoff_ms(n, 0.5)).collect();
        assert_eq!(
            delays,
            [500, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]
        );
    }

    #[test]
    fn the_jitter_stays_within_thirty_percent() {
        assert_eq!(backoff_ms(1, 0.0), 700);
        assert_eq!(backoff_ms(1, 1.0), 1300);
    }
}
