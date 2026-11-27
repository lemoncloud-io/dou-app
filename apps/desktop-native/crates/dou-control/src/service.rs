use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use dou_core::Error;
use dou_engine::{Engine, Message, Origin, Remote, SendOptions};
use serde_json::{Value, json};
use tokio::sync::{Notify, broadcast};

use crate::guard::{Action, Client, authorize};
use crate::limiter::Limiter;
use crate::settings::Settings;

pub struct Service<R> {
    engine: Engine<R>,
    settings_path: PathBuf,
    settings: RwLock<Settings>,
    limiter: Mutex<Limiter>,
    arrived: Notify,
}

fn rpc(code: &str, message: impl Into<String>) -> Value {
    json!({ "code": code, "message": message.into() })
}

fn text<'a>(params: &'a Value, key: &str) -> Result<&'a str, Value> {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| rpc("bad_params", format!("{key} is required")))
}

fn number(params: &Value, key: &str, default: i64) -> i64 {
    params.get(key).and_then(Value::as_i64).unwrap_or(default)
}

fn from_engine(error: Error) -> Value {
    match error {
        Error::Http { status, message } => rpc(&format!("http_{status}"), message),
        other => rpc("engine_error", other.to_string()),
    }
}

fn message_json(message: &Message) -> Value {
    json!({
        "id": message.id,
        "channelId": message.channel_id,
        "chatNo": message.chat_no,
        "ownerId": message.owner_id,
        "ownerName": message.owner_name,
        "content": message.content,
        "stereo": message.stereo,
        "parentId": message.parent_id,
        "mention": { "userIds": message.mention_user_ids, "all": message.mention_all },
        "createdAt": message.created_at,
    })
}

impl<R: Remote> Service<R> {
    pub fn new(engine: Engine<R>, settings_path: PathBuf) -> Self {
        let settings = RwLock::new(Settings::load(&settings_path));
        Self {
            engine,
            settings_path,
            settings,
            limiter: Mutex::new(Limiter::default()),
            arrived: Notify::new(),
        }
    }

    fn settings(&self) -> Settings {
        self.settings
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn current_settings(&self) -> Settings {
        self.settings()
    }

    pub fn set_settings(&self, next: Settings) -> dou_core::Result<()> {
        next.save(&self.settings_path)?;
        *self
            .settings
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = next;
        Ok(())
    }

    fn gate(&self, client: Client, action: &Action<'_>) -> Result<Settings, Value> {
        let settings = self.settings();
        let mut limiter = self
            .limiter
            .lock()
            .map_err(|_| rpc("internal", "limiter poisoned"))?;
        authorize(client, &settings, action, &mut limiter, Instant::now())
            .map_err(|denial| rpc(denial.code, denial.message))?;
        Ok(settings)
    }

    pub async fn pump(&self, mut events: broadcast::Receiver<(String, Value)>) {
        loop {
            let (ty, data) = match events.recv().await {
                Ok(item) => item,
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => return,
            };
            let settings = self.settings();
            let Ok(Some((message, kinds))) = self
                .engine
                .ingest(&ty, &data, |room| settings.allows_room(room))
            else {
                continue;
            };
            if kinds.is_empty() {
                continue;
            }
            let mut body = message_json(&message);
            body["kinds"] = json!(kinds.iter().map(|kind| kind.as_str()).collect::<Vec<_>>());
            if self
                .engine
                .store()
                .journal_append(kinds[0].as_str(), &body)
                .is_ok()
            {
                self.arrived.notify_waiters();
            }
        }
    }

    pub async fn handle(
        &self,
        client: Client,
        method: &str,
        params: Value,
    ) -> Result<Value, Value> {
        match method {
            "status" => {
                self.gate(client, &Action::Read)?;
                let settings = self.settings();
                Ok(
                    json!({ "cloudId": self.engine.cid(), "me": self.engine.me(), "tier": settings.tier }),
                )
            }
            "clouds" => {
                self.gate(client, &Action::Read)?;
                Ok(json!({ "list": [{ "id": self.engine.cid(), "me": self.engine.me() }] }))
            }
            "settings_get" => {
                self.gate(client, &Action::Read)?;
                serde_json::to_value(self.settings()).map_err(|e| rpc("internal", e.to_string()))
            }
            "rooms" => {
                let settings = self.gate(client, &Action::Read)?;
                let rooms = self.engine.rooms().await.map_err(from_engine)?;
                let list: Vec<Value> = rooms
                    .iter()
                    .map(|room| {
                        json!({
                            "id": room.id,
                            "title": room.title(self.engine.me()),
                            "stereo": room.stereo,
                            "memberIds": room.member_ids,
                            "chatNo": room.chat_no,
                            "unread": room.unread,
                            "allowed": settings.allows_room(&room.id),
                        })
                    })
                    .collect();
                Ok(json!({ "list": list }))
            }
            "messages" => {
                self.gate(client, &Action::Read)?;
                let channel = text(&params, "channelId")?;
                let limit =
                    usize::try_from(number(&params, "limit", 20).clamp(1, 100)).unwrap_or(20);
                let before = params.get("before").and_then(Value::as_i64);
                let page = self
                    .engine
                    .messages(channel, limit, before)
                    .await
                    .map_err(from_engine)?;
                Ok(json!({ "list": page.iter().map(message_json).collect::<Vec<_>>() }))
            }
            "thread" => {
                self.gate(client, &Action::Read)?;
                let channel = text(&params, "channelId")?;
                let parent = text(&params, "parentId")?;
                let page = self
                    .engine
                    .messages(channel, 100, None)
                    .await
                    .map_err(from_engine)?;
                let list: Vec<Value> = page
                    .iter()
                    .filter(|message| {
                        message.id == parent || message.parent_id.as_deref() == Some(parent)
                    })
                    .map(message_json)
                    .collect();
                Ok(json!({ "list": list }))
            }
            "send" | "reply" | "mention" => {
                let channel = text(&params, "channelId")?;
                let body = text(&params, "text")?;
                let mut options = SendOptions::default();
                if method == "reply" {
                    let parent = text(&params, "parentId")?;
                    in_channel(channel, parent, "parentId")?;
                    options.parent_id = Some(parent.to_string());
                }
                if method == "mention" {
                    options.mention_user_ids = params
                        .get("userIds")
                        .and_then(Value::as_array)
                        .map(|ids| {
                            ids.iter()
                                .filter_map(|id| id.as_str().map(str::to_string))
                                .collect()
                        })
                        .unwrap_or_default();
                    if options.mention_user_ids.is_empty() {
                        return Err(rpc("bad_params", "userIds is required"));
                    }
                }
                self.gate(
                    client,
                    &Action::Write {
                        channel_id: channel,
                    },
                )?;
                let sent = self
                    .engine
                    .send(channel, body, &options, Origin::Ai)
                    .await
                    .map_err(from_engine)?;
                Ok(message_json(&sent))
            }
            "react" => {
                let channel = text(&params, "channelId")?;
                let chat = text(&params, "chatId")?;
                let emoji = text(&params, "emoji")?;
                chat_of(channel, chat)?;
                self.gate(
                    client,
                    &Action::Write {
                        channel_id: channel,
                    },
                )?;
                let on = params.get("on").and_then(Value::as_bool).unwrap_or(true);
                self.engine
                    .react(chat, emoji, on)
                    .await
                    .map_err(from_engine)?;
                Ok(json!({ "ok": true }))
            }
            "events_list" => {
                self.gate(client, &Action::Read)?;
                self.events_since(&params)
            }
            "events_wait" => {
                self.gate(client, &Action::Read)?;
                let timeout = Duration::from_millis(
                    number(&params, "timeoutMs", 30_000)
                        .clamp(0, 60_000)
                        .unsigned_abs(),
                );
                let deadline = tokio::time::Instant::now() + timeout;
                loop {
                    let waiter = self.arrived.notified();
                    tokio::pin!(waiter);
                    waiter.as_mut().enable();
                    let found = self.events_since(&params)?;
                    if found["events"]
                        .as_array()
                        .is_some_and(|events| !events.is_empty())
                    {
                        return Ok(found);
                    }
                    if tokio::time::timeout_at(deadline, waiter).await.is_err() {
                        return self.events_since(&params);
                    }
                }
            }
            other => Err(rpc("unknown_method", format!("no such method: {other}"))),
        }
    }

    fn events_since(&self, params: &Value) -> Result<Value, Value> {
        let limit = usize::try_from(number(params, "limit", 50).clamp(1, 200)).unwrap_or(50);
        let since = if params.get("tail").and_then(Value::as_bool) == Some(true) {
            let last = self
                .engine
                .store()
                .journal_last()
                .map_err(|e| rpc("internal", e.to_string()))?;
            (last - i64::try_from(limit).unwrap_or(50)).max(0)
        } else {
            number(params, "since", 0)
        };
        let rows = self
            .engine
            .store()
            .journal_since(since, limit)
            .map_err(|e| rpc("internal", e.to_string()))?;
        let cursor = rows.last().map_or(since, |row| row.0);
        let events: Vec<Value> = rows
            .into_iter()
            .map(|(seq, kind, body)| json!({ "seq": seq, "kind": kind, "message": body }))
            .collect();
        Ok(json!({ "events": events, "cursor": cursor }))
    }
}

fn chat_of(channel: &str, id: &str) -> Result<(), Value> {
    let digits = id
        .strip_prefix(channel)
        .and_then(|rest| rest.strip_prefix(':'));
    if digits.is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())) {
        return Ok(());
    }
    Err(rpc(
        "bad_params",
        format!("chatId must look like {channel}:<number>"),
    ))
}

fn in_channel(channel: &str, id: &str, field: &str) -> Result<(), Value> {
    if id.contains(':') && !id.starts_with(&format!("{channel}:")) {
        return Err(rpc(
            "bad_params",
            format!("{field} does not belong to room {channel}"),
        ));
    }
    Ok(())
}

pub fn arc<R: Remote>(service: Service<R>) -> Arc<Service<R>> {
    Arc::new(service)
}
#[cfg(test)]
mod channel_tests {
    use super::{chat_of, in_channel};

    #[test]
    fn an_id_from_another_room_is_refused_and_a_bare_number_passes() {
        assert!(in_channel("A", "A:5", "chatId").is_ok());
        assert!(in_channel("A", "5", "parentId").is_ok());
        assert!(in_channel("A", "B:5", "chatId").is_err());
    }

    #[test]
    fn a_chat_id_must_be_channel_colon_digits() {
        assert!(chat_of("A", "A:5").is_ok());
        for bad in ["5", "A:", "A:5x", "B:5", "A:5:6", "", "AA:5", ":5"] {
            assert!(chat_of("A", bad).is_err(), "{bad}");
        }
    }
}
