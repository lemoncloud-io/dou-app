use std::collections::{HashSet, VecDeque};

use dou_core::Result;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct OutboxEntry {
    pub id: String,
    pub cid: String,
    pub channel_id: String,
    pub payload: Value,
}

pub trait OutboxPort {
    fn send(&self, entry: &OutboxEntry) -> impl Future<Output = Result<()>>;
    fn has_landed(&self, entry: &OutboxEntry) -> impl Future<Output = Result<bool>>;
    fn discard(&self, entry: &OutboxEntry) -> impl Future<Output = Result<()>>;
}

pub struct ChatOutbox<P> {
    port: P,
    queues: Vec<(String, VecDeque<OutboxEntry>)>,
    ready: HashSet<String>,
    running: bool,
}

fn queue_key(cid: &str, channel_id: &str) -> String {
    format!("{cid}|{channel_id}")
}

impl<P: OutboxPort> ChatOutbox<P> {
    pub fn new(port: P) -> Self {
        Self {
            port,
            queues: Vec::new(),
            ready: HashSet::new(),
            running: false,
        }
    }

    pub fn port(&self) -> &P {
        &self.port
    }

    pub async fn start(&mut self) {
        self.running = true;
        self.drain().await;
    }

    pub fn stop(&mut self) {
        self.running = false;
    }

    pub async fn set_ready(&mut self, cid: &str, ready: bool) {
        if ready == self.ready.contains(cid) {
            return;
        }
        if ready {
            self.ready.insert(cid.to_string());
            self.drain().await;
        } else {
            self.ready.remove(cid);
        }
    }

    pub async fn enqueue(&mut self, entry: OutboxEntry) {
        let key = queue_key(&entry.cid, &entry.channel_id);
        match self
            .queues
            .iter_mut()
            .find(|(existing, _)| *existing == key)
        {
            Some((_, queue)) => {
                if queue.iter().any(|queued| queued.id == entry.id) {
                    return;
                }
                queue.push_back(entry);
            }
            None => self.queues.push((key, VecDeque::from([entry]))),
        }
        self.drain().await;
    }

    pub fn remove(&mut self, id: &str) {
        for index in 0..self.queues.len() {
            let queue = &mut self.queues[index].1;
            if let Some(position) = queue.iter().position(|entry| entry.id == id) {
                queue.remove(position);
                if queue.is_empty() {
                    self.queues.remove(index);
                }
                return;
            }
        }
    }

    pub fn pending(&self) -> Vec<&OutboxEntry> {
        self.queues
            .iter()
            .flat_map(|(_, queue)| queue.iter())
            .collect()
    }

    pub async fn drain(&mut self) {
        let mut index = 0;
        while index < self.queues.len() {
            self.drain_queue(index).await;
            if self.queues[index].1.is_empty() {
                self.queues.remove(index);
            } else {
                index += 1;
            }
        }
    }

    async fn drain_queue(&mut self, index: usize) {
        while self.running {
            let Some(head) = self.queues[index].1.front().cloned() else {
                return;
            };
            if !self.ready.contains(&head.cid) {
                return;
            }
            if self.port.has_landed(&head).await.unwrap_or(false) {
                self.queues[index].1.pop_front();
                let _ = self.port.discard(&head).await;
                continue;
            }
            let _ = self.port.send(&head).await;
            self.queues[index].1.pop_front();
        }
    }
}
