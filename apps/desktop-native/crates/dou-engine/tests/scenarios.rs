use std::cell::RefCell;

use dou_core::{Error, Result};
use dou_engine::{ChatOutbox, OutboxEntry, OutboxPort};
use serde::Deserialize;

#[derive(Deserialize)]
struct File {
    vectors: Vec<Scenario>,
}

#[derive(Deserialize)]
struct Scenario {
    name: String,
    ops: Vec<Op>,
    #[serde(rename = "failIds")]
    fail_ids: Vec<String>,
    #[serde(rename = "landedIds")]
    landed_ids: Vec<String>,
    #[serde(rename = "probeFailIds")]
    probe_fail_ids: Vec<String>,
    steps: Vec<Step>,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum Op {
    Start,
    Stop,
    Ready {
        cid: String,
        ready: bool,
    },
    Enqueue {
        id: String,
        cid: String,
        #[serde(rename = "channelId")]
        channel_id: String,
    },
    Remove {
        id: String,
    },
}

#[derive(Deserialize, Debug, PartialEq)]
struct Step {
    sent: Vec<String>,
    discarded: Vec<String>,
    pending: Vec<String>,
}

struct Script<'a> {
    scenario: &'a Scenario,
    sent: RefCell<Vec<String>>,
    discarded: RefCell<Vec<String>>,
}

impl OutboxPort for Script<'_> {
    async fn send(&self, entry: &OutboxEntry) -> Result<()> {
        self.sent.borrow_mut().push(entry.id.clone());
        if self.scenario.fail_ids.contains(&entry.id) {
            return Err(Error::Network("send failed".into()));
        }
        Ok(())
    }

    async fn has_landed(&self, entry: &OutboxEntry) -> Result<bool> {
        if self.scenario.probe_fail_ids.contains(&entry.id) {
            return Err(Error::Network("probe failed".into()));
        }
        Ok(self.scenario.landed_ids.contains(&entry.id))
    }

    async fn discard(&self, entry: &OutboxEntry) -> Result<()> {
        self.discarded.borrow_mut().push(entry.id.clone());
        Ok(())
    }
}

#[tokio::test]
async fn the_chat_outbox_follows_every_scenario_taken_from_the_ts_outbox() {
    let file: File =
        serde_json::from_str(include_str!("../../../vectors/chat-outbox.json")).unwrap();
    assert!(file.vectors.len() >= 14);
    for scenario in &file.vectors {
        let mut outbox = ChatOutbox::new(Script {
            scenario,
            sent: RefCell::new(Vec::new()),
            discarded: RefCell::new(Vec::new()),
        });
        for (index, op) in scenario.ops.iter().enumerate() {
            match op {
                Op::Start => outbox.start().await,
                Op::Stop => outbox.stop(),
                Op::Ready { cid, ready } => outbox.set_ready(cid, *ready).await,
                Op::Enqueue {
                    id,
                    cid,
                    channel_id,
                } => {
                    outbox
                        .enqueue(OutboxEntry {
                            id: id.clone(),
                            cid: cid.clone(),
                            channel_id: channel_id.clone(),
                            payload: serde_json::Value::Null,
                        })
                        .await
                }
                Op::Remove { id } => outbox.remove(id),
            }
            let got = Step {
                sent: outbox.port().sent.borrow().clone(),
                discarded: outbox.port().discarded.borrow().clone(),
                pending: outbox.pending().iter().map(|e| e.id.clone()).collect(),
            };
            assert_eq!(got, scenario.steps[index], "{} step {index}", scenario.name);
        }
    }
}
