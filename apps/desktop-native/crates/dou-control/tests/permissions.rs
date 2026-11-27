use std::sync::{Arc, Mutex};

use dou_control::{Client, RateLimit, Service, Settings, Tier, arc, call, control_name, serve};
use dou_core::Result;
use dou_engine::{Engine, Remote};
use dou_store::Store;
use serde_json::{Value, json};

#[derive(Clone, Default)]
struct Recorder {
    calls: Arc<Mutex<Vec<(String, Value)>>>,
}

impl Remote for Recorder {
    async fn request(&self, ty: &str, data: Option<Value>) -> Result<Value> {
        let data = data.unwrap_or(Value::Null);
        self.calls
            .lock()
            .unwrap()
            .push((ty.to_string(), data.clone()));
        Ok(match ty {
            "chat.send" => json!({
                "id": "r1:9", "channelId": data["channelId"], "chatNo": 9,
                "ownerId": "me", "content": data["content"], "stereo": "text"
            }),
            "channel.mine" => {
                json!({ "list": [{ "id": "r1", "stereo": "group", "memberIds": ["me", "o"], "chatNo": 9 }] })
            }
            "chat.feed" => json!({ "list": [] }),
            _ => json!({}),
        })
    }
}

fn setup(settings: Option<Settings>) -> (Service<Recorder>, Recorder, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!("dou-control-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("settings.json");
    if let Some(settings) = settings {
        settings.save(&path).unwrap();
    }
    let recorder = Recorder::default();
    let engine = Engine::new(
        recorder.clone(),
        Arc::new(Store::in_memory().unwrap()),
        "c1",
        "me",
    );
    (Service::new(engine, path), recorder, dir)
}

fn allowed(tier: Tier) -> Settings {
    Settings {
        tier,
        allow_rooms: vec!["r1".into()],
        rate_limit: RateLimit {
            per_minute: 2,
            per_hour: 10,
        },
    }
}

fn sent(recorder: &Recorder) -> usize {
    recorder
        .calls
        .lock()
        .unwrap()
        .iter()
        .filter(|(ty, _)| ty == "chat.send")
        .count()
}

async fn write_as_mcp(
    service: &Service<Recorder>,
    channel: &str,
) -> std::result::Result<Value, Value> {
    service
        .handle(
            Client::Mcp,
            "send",
            json!({ "channelId": channel, "text": "hi" }),
        )
        .await
}

#[tokio::test]
async fn with_no_settings_file_every_mcp_call_is_denied_and_nothing_leaves() {
    let (service, recorder, _) = setup(None);
    for method in ["rooms", "messages", "send", "events_list"] {
        let params = json!({ "channelId": "r1", "text": "x" });
        let denied = service
            .handle(Client::Mcp, method, params)
            .await
            .unwrap_err();
        assert_eq!(denied["code"], "tier_off", "{method}");
    }
    assert!(recorder.calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn read_tier_reads_but_never_sends() {
    let (service, recorder, _) = setup(Some(allowed(Tier::Read)));
    assert!(
        service
            .handle(Client::Mcp, "rooms", Value::Null)
            .await
            .is_ok()
    );
    assert_eq!(
        write_as_mcp(&service, "r1").await.unwrap_err()["code"],
        "tier_read_only"
    );
    assert_eq!(sent(&recorder), 0);
}

#[tokio::test]
async fn write_tier_refuses_a_room_off_the_allow_list_and_sends_nothing() {
    let (service, recorder, _) = setup(Some(allowed(Tier::Write)));
    assert_eq!(
        write_as_mcp(&service, "elsewhere").await.unwrap_err()["code"],
        "room_not_allowed"
    );
    assert_eq!(sent(&recorder), 0);
}

#[tokio::test]
async fn reading_a_room_off_the_allow_list_is_denied_and_the_relay_is_not_asked() {
    let (service, recorder, _) = setup(Some(allowed(Tier::Read)));
    for method in ["messages", "thread"] {
        let denied = service
            .handle(
                Client::Mcp,
                method,
                json!({ "channelId": "elsewhere", "parentId": "elsewhere:1" }),
            )
            .await
            .unwrap_err();
        assert_eq!(denied["code"], "room_not_allowed", "{method}");
    }
    assert!(recorder.calls.lock().unwrap().is_empty());
    assert!(
        service
            .handle(Client::Mcp, "messages", json!({ "channelId": "r1" }))
            .await
            .is_ok()
    );
    assert!(
        service
            .handle(Client::Cli, "messages", json!({ "channelId": "elsewhere" }))
            .await
            .is_ok()
    );
}

#[tokio::test]
async fn rooms_lists_every_room_with_readable_and_writable_flags() {
    let (service, _, _) = setup(Some(Settings {
        allow_rooms: vec![],
        ..allowed(Tier::Write)
    }));
    let none = service
        .handle(Client::Mcp, "rooms", Value::Null)
        .await
        .unwrap();
    assert_eq!(none["list"][0]["readable"], false);
    assert_eq!(none["list"][0]["writable"], false);
    let (service, _, _) = setup(Some(allowed(Tier::Read)));
    let read = service
        .handle(Client::Mcp, "rooms", Value::Null)
        .await
        .unwrap();
    assert_eq!(read["list"][0]["readable"], true);
    assert_eq!(read["list"][0]["writable"], false);
    let (service, _, _) = setup(Some(allowed(Tier::Write)));
    let write = service
        .handle(Client::Mcp, "rooms", Value::Null)
        .await
        .unwrap();
    assert_eq!(write["list"][0]["writable"], true);
}

#[tokio::test]
async fn a_reaction_or_reply_aimed_at_another_room_is_refused_and_sends_nothing() {
    let (service, recorder, _) = setup(Some(allowed(Tier::Write)));
    let react = service
        .handle(
            Client::Mcp,
            "react",
            json!({ "channelId": "r1", "chatId": "other:5", "emoji": "x" }),
        )
        .await
        .unwrap_err();
    assert_eq!(react["code"], "bad_params");
    let reply = service
        .handle(
            Client::Mcp,
            "reply",
            json!({ "channelId": "r1", "parentId": "other:5", "text": "x" }),
        )
        .await
        .unwrap_err();
    assert_eq!(reply["code"], "bad_params");
    assert!(recorder.calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn the_third_write_in_a_minute_is_rate_limited() {
    let (service, recorder, _) = setup(Some(allowed(Tier::Write)));
    assert!(write_as_mcp(&service, "r1").await.is_ok());
    assert!(write_as_mcp(&service, "r1").await.is_ok());
    assert_eq!(
        write_as_mcp(&service, "r1").await.unwrap_err()["code"],
        "rate_limited"
    );
    assert_eq!(sent(&recorder), 2);
}

#[tokio::test]
async fn every_text_an_mcp_write_sends_starts_with_the_ai_prefix_and_no_argument_turns_it_off() {
    let (service, recorder, _) = setup(Some(allowed(Tier::Write)));
    service
        .handle(
            Client::Mcp,
            "send",
            json!({ "channelId": "r1", "text": "hello", "origin": "person", "prefix": false }),
        )
        .await
        .unwrap();
    service
        .handle(
            Client::Mcp,
            "reply",
            json!({ "channelId": "r1", "parentId": "r1:3", "text": "ok", "origin": "person" }),
        )
        .await
        .unwrap();
    let calls = recorder.calls.lock().unwrap();
    let sends: Vec<&Value> = calls
        .iter()
        .filter(|(ty, _)| ty == "chat.send")
        .map(|(_, d)| d)
        .collect();
    assert_eq!(sends[0]["content"], "[AI] hello");
    assert_eq!(sends[1]["content"], "[AI] ok");
    assert_eq!(sends[1]["parentId"], "r1:3");
}

#[tokio::test]
async fn a_mention_carries_the_user_ids_and_needs_at_least_one() {
    let (service, recorder, _) = setup(Some(allowed(Tier::Write)));
    let bad = service
        .handle(
            Client::Mcp,
            "mention",
            json!({ "channelId": "r1", "text": "x" }),
        )
        .await
        .unwrap_err();
    assert_eq!(bad["code"], "bad_params");
    service
        .handle(
            Client::Mcp,
            "mention",
            json!({ "channelId": "r1", "text": "look", "userIds": ["u7"] }),
        )
        .await
        .unwrap();
    let calls = recorder.calls.lock().unwrap();
    assert_eq!(calls[0].1["mention"]["userIds"][0], "u7");
}

#[tokio::test]
async fn there_is_no_method_that_changes_the_tier_or_the_allow_list() {
    let (service, _, dir) = setup(Some(allowed(Tier::Full)));
    for method in ["settings_set", "set_tier", "allow_room", "permissions"] {
        for client in [Client::Mcp, Client::Cli] {
            let denied = service
                .handle(client, method, json!({ "tier": "full", "room": "x" }))
                .await
                .unwrap_err();
            assert_eq!(denied["code"], "unknown_method");
        }
    }
    assert_eq!(
        Settings::load(&dir.join("settings.json")),
        allowed(Tier::Full)
    );
}

#[tokio::test]
async fn events_wait_returns_a_mention_that_arrives_while_waiting() {
    let (service, _, _) = setup(Some(allowed(Tier::Read)));
    let service = Arc::new(service);
    let (tx, rx) = tokio::sync::broadcast::channel(8);
    let pump = Arc::clone(&service);
    tokio::spawn(async move { pump.pump(rx).await });

    let waiter = Arc::clone(&service);
    let waiting = tokio::spawn(async move {
        waiter
            .handle(
                Client::Mcp,
                "events_wait",
                json!({ "since": 0, "timeoutMs": 5000 }),
            )
            .await
    });
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    tx.send((
        "chat.sync".to_string(),
        json!({ "id": "r1:12", "channelId": "r1", "chatNo": 12, "ownerId": "other", "content": "hey @me",
                "stereo": "text", "mention$": { "userIds": ["me"] } }),
    ))
    .unwrap();

    let result = waiting.await.unwrap().unwrap();
    assert_eq!(result["events"][0]["kind"], "mention");
    assert_eq!(result["events"][0]["message"]["chatNo"], 12);
    assert_eq!(result["cursor"], result["events"][0]["seq"]);

    let again = service
        .handle(
            Client::Mcp,
            "events_wait",
            json!({ "since": result["cursor"], "timeoutMs": 50 }),
        )
        .await
        .unwrap();
    assert_eq!(again["events"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn the_ipc_carries_a_request_and_its_denial_to_another_connection() {
    let (service, _, dir) = setup(None);
    let service = arc(service);
    let name = control_name(&dir, Client::Mcp);
    let owner = control_name(&dir, Client::Cli);
    for (served, client) in [(name.clone(), Client::Mcp), (owner.clone(), Client::Cli)] {
        let server = Arc::clone(&service);
        tokio::spawn(async move { serve(&served, server, client).await });
    }
    let mut reply = None;
    let mut last_error = String::new();
    for _ in 0..50 {
        match call(&name, "rooms", Value::Null).await {
            Ok(answer) => {
                reply = Some(answer);
                break;
            }
            Err(error) => last_error = error.to_string(),
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert_eq!(
        reply
            .unwrap_or_else(|| panic!("no reply: {last_error} ({name})"))
            .unwrap_err()["code"],
        "tier_off"
    );
    let cli = call(&owner, "clouds", Value::Null).await.unwrap().unwrap();
    assert_eq!(cli["list"][0]["id"], "c1");
}
