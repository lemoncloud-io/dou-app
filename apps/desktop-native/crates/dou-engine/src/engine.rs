use std::sync::Arc;

use dou_core::{Error, Result};
use dou_socket::Socket;
use dou_store::Store;
use serde_json::{Value, json};

use crate::events::{ChatContext, EventKind, classify_chat};
use crate::model::{Member, Message, Room};

pub const AI_PREFIX: &str = "[AI] ";

const RELAY_PAGE: usize = 100;
const RELAY_PAGES: usize = 5;

#[derive(Debug, Clone, Copy)]
pub struct SearchQuery<'a> {
    pub channel_id: &'a str,
    pub keyword: &'a str,
    pub since: Option<i64>,
    pub until: Option<i64>,
    pub limit: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Hit {
    pub message: Message,
    pub source: &'static str,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct SearchOutcome {
    pub hits: Vec<Hit>,
    pub relay_error: Option<String>,
}

fn matches(message: &Message, query: &SearchQuery<'_>) -> bool {
    message
        .content
        .to_lowercase()
        .contains(&query.keyword.to_lowercase())
        && query.since.is_none_or(|since| message.created_at >= since)
        && query.until.is_none_or(|until| message.created_at <= until)
}

pub trait Remote: Send + Sync {
    fn request(&self, ty: &str, data: Option<Value>) -> impl Future<Output = Result<Value>> + Send;
}

impl Remote for dou_socket::Link {
    async fn request(&self, ty: &str, data: Option<Value>) -> Result<Value> {
        dou_socket::Link::request(self, ty, data.as_ref()).await
    }
}

impl Remote for Socket {
    async fn request(&self, ty: &str, data: Option<Value>) -> Result<Value> {
        Socket::request(self, ty, data.as_ref(), None).await
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    Person,
    Ai,
}

#[derive(Debug, Clone, Default)]
pub struct SendOptions {
    pub parent_id: Option<String>,
    pub mention_user_ids: Vec<String>,
}

pub struct Engine<R> {
    remote: R,
    store: Arc<Store>,
    cid: String,
    me: String,
}

fn invalid(what: &str) -> Error {
    Error::InvalidResponse(what.to_string())
}

impl<R: Remote> Engine<R> {
    pub fn new(remote: R, store: Arc<Store>, cid: &str, me: &str) -> Self {
        Self {
            remote,
            store,
            cid: cid.to_string(),
            me: me.to_string(),
        }
    }

    pub fn me(&self) -> &str {
        &self.me
    }

    pub fn cid(&self) -> &str {
        &self.cid
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    pub async fn rooms(&self) -> Result<Vec<Room>> {
        let answer = self.remote.request("channel.mine", None).await?;
        let list = answer
            .get("list")
            .and_then(Value::as_array)
            .ok_or_else(|| invalid("channel.mine has no list"))?;
        let rows: Vec<(String, Value)> = list
            .iter()
            .filter_map(|room| Some((room.get("id")?.as_str()?.to_string(), room.clone())))
            .collect();
        self.store.replace_rooms(&self.cid, &rows)?;
        Ok(list.iter().filter_map(Room::from_json).collect())
    }

    pub async fn messages(
        &self,
        channel_id: &str,
        limit: usize,
        before: Option<i64>,
    ) -> Result<Vec<Message>> {
        let mut data = json!({ "channelId": channel_id, "limit": limit });
        if let Some(cursor) = before {
            data["cursorNo"] = json!(cursor);
        }
        let answer = self.remote.request("chat.feed", Some(data)).await?;
        let list = answer
            .get("list")
            .and_then(Value::as_array)
            .ok_or_else(|| invalid("chat.feed has no list"))?;
        let mut messages = Vec::new();
        for chat in list {
            if let Some(message) = Message::from_json(chat) {
                self.store
                    .upsert_message(&self.cid, channel_id, message.chat_no, chat)?;
                messages.push(message);
            }
        }
        messages.sort_by_key(|m| m.chat_no);
        Ok(messages)
    }

    pub async fn search(&self, query: &SearchQuery<'_>) -> Result<SearchOutcome> {
        let mut hits: Vec<Hit> = self
            .store
            .search_messages(
                &self.cid,
                query.channel_id,
                query.keyword,
                query.since,
                query.until,
                query.limit,
            )?
            .iter()
            .filter_map(Message::from_json)
            .map(|message| Hit {
                message,
                source: "local",
            })
            .collect();
        let mut relay_error = None;
        let mut before = None;
        'pages: for _ in 0..RELAY_PAGES {
            if hits.len() >= query.limit {
                break;
            }
            let page = match self.messages(query.channel_id, RELAY_PAGE, before).await {
                Ok(page) => page,
                Err(error) => {
                    relay_error = Some(error.to_string());
                    break;
                }
            };
            let Some(oldest) = page.first() else { break };
            let (oldest_no, oldest_at, full) =
                (oldest.chat_no, oldest.created_at, page.len() >= RELAY_PAGE);
            for message in page.into_iter().rev() {
                let known = hits
                    .iter()
                    .any(|hit| hit.message.chat_no == message.chat_no);
                if !known && matches(&message, query) {
                    hits.push(Hit {
                        message,
                        source: "relay",
                    });
                    if hits.len() >= query.limit {
                        break 'pages;
                    }
                }
            }
            if !full || query.since.is_some_and(|since| oldest_at < since) {
                break;
            }
            before = Some(oldest_no);
        }
        hits.sort_by_key(|hit| std::cmp::Reverse(hit.message.chat_no));
        hits.truncate(query.limit);
        Ok(SearchOutcome { hits, relay_error })
    }

    pub async fn members(&self, channel_id: &str) -> Result<Vec<Member>> {
        let answer = self
            .remote
            .request(
                "channel.list-user",
                Some(json!({ "channelId": channel_id })),
            )
            .await?;
        let list = answer
            .get("list")
            .and_then(Value::as_array)
            .ok_or_else(|| invalid("channel.list-user has no list"))?;
        Ok(list.iter().filter_map(Member::from_json).collect())
    }

    pub async fn mark_read(&self, channel_id: &str, chat_no: i64) -> Result<()> {
        let data = json!({ "channelId": channel_id, "chatNo": chat_no });
        self.remote
            .request("chat.read", Some(data))
            .await
            .map(|_| ())
    }

    pub async fn send(
        &self,
        channel_id: &str,
        text: &str,
        options: &SendOptions,
        origin: Origin,
    ) -> Result<Message> {
        let content = match origin {
            Origin::Ai if text.starts_with(AI_PREFIX) => text.to_string(),
            Origin::Ai => format!("{AI_PREFIX}{text}"),
            Origin::Person => text.to_string(),
        };
        let mut data = json!({ "channelId": channel_id, "content": content });
        if let Some(parent) = &options.parent_id {
            data["parentId"] = json!(parent);
        }
        if !options.mention_user_ids.is_empty() {
            data["mention"] = json!({ "userIds": options.mention_user_ids });
        }
        let answer = self.remote.request("chat.send", Some(data)).await?;
        let message =
            Message::from_json(&answer).ok_or_else(|| invalid("chat.send answered no chat"))?;
        self.store
            .upsert_message(&self.cid, channel_id, message.chat_no, &answer)?;
        Ok(message)
    }

    pub async fn react(&self, chat_id: &str, emoji: &str, on: bool) -> Result<()> {
        let data = json!({
            "chatId": chat_id,
            "emoji": emoji,
            "action": if on { "on" } else { "off" },
        });
        self.remote
            .request("chat.reaction", Some(data))
            .await
            .map(|_| ())
    }

    pub fn ingest(
        &self,
        ty: &str,
        data: &Value,
        room_is_allowed: impl Fn(&str) -> bool,
    ) -> Result<Option<(Message, Vec<EventKind>)>> {
        if ty != "chat.sync" {
            return Ok(None);
        }
        let Some(message) = Message::from_json(data) else {
            return Ok(None);
        };
        self.store
            .upsert_message(&self.cid, &message.channel_id, message.chat_no, data)?;
        let room_is_dm = self.store.rooms(&self.cid)?.iter().any(|room| {
            room.get("id").and_then(Value::as_str) == Some(message.channel_id.as_str())
                && room.get("stereo").and_then(Value::as_str) == Some("dm")
        });
        let parent_owner = message
            .parent_id
            .as_deref()
            .and_then(|parent| parent.rsplit_once(':'))
            .and_then(|(channel, no)| Some((channel.to_string(), no.parse::<i64>().ok()?)))
            .map(|(channel, no)| self.store.message(&self.cid, &channel, no))
            .transpose()?
            .flatten()
            .and_then(|parent| {
                parent
                    .get("ownerId")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            });
        let kinds = classify_chat(
            &message,
            &ChatContext {
                me: &self.me,
                room_is_dm,
                room_is_allowed: room_is_allowed(&message.channel_id),
                parent_owner_id: parent_owner.as_deref(),
            },
        );
        Ok(Some((message, kinds)))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    struct Fake {
        calls: Mutex<Vec<(String, Option<Value>)>>,
        answers: Mutex<Vec<Value>>,
    }

    impl Fake {
        fn new(answers: Vec<Value>) -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                answers: Mutex::new(answers),
            }
        }
    }

    impl Remote for Fake {
        async fn request(&self, ty: &str, data: Option<Value>) -> Result<Value> {
            self.calls.lock().unwrap().push((ty.to_string(), data));
            let mut answers = self.answers.lock().unwrap();
            if answers.is_empty() {
                return Err(Error::Network("no scripted answer".into()));
            }
            Ok(answers.remove(0))
        }
    }

    fn chat(no: i64, owner: &str) -> Value {
        json!({ "id": format!("r:{no}"), "channelId": "r", "chatNo": no, "ownerId": owner, "content": "x", "stereo": "text" })
    }

    fn engine(answers: Vec<Value>) -> Engine<Fake> {
        Engine::new(
            Fake::new(answers),
            Arc::new(Store::in_memory().unwrap()),
            "c1",
            "me",
        )
    }

    #[tokio::test]
    async fn an_ai_send_is_prefixed_once_and_a_person_send_is_not() {
        let engine = engine(vec![chat(1, "me"), chat(2, "me"), chat(3, "me")]);
        let options = SendOptions::default();
        engine
            .send("r", "hello", &options, Origin::Ai)
            .await
            .unwrap();
        engine
            .send("r", "[AI] again", &options, Origin::Ai)
            .await
            .unwrap();
        engine
            .send("r", "by hand", &options, Origin::Person)
            .await
            .unwrap();
        let calls = engine.remote.calls.lock().unwrap();
        let contents: Vec<&str> = calls
            .iter()
            .map(|(_, data)| data.as_ref().unwrap()["content"].as_str().unwrap())
            .collect();
        assert_eq!(contents, ["[AI] hello", "[AI] again", "by hand"]);
    }

    #[tokio::test]
    async fn a_reply_and_a_mention_ride_in_the_send_payload() {
        let engine = engine(vec![chat(4, "me")]);
        let options = SendOptions {
            parent_id: Some("r:2".into()),
            mention_user_ids: vec!["u9".into()],
        };
        engine
            .send("r", "ok", &options, Origin::Person)
            .await
            .unwrap();
        let sent = engine.remote.calls.lock().unwrap()[0].1.clone().unwrap();
        assert_eq!(sent["parentId"], "r:2");
        assert_eq!(sent["mention"]["userIds"][0], "u9");
    }

    #[tokio::test]
    async fn messages_are_returned_oldest_first_and_cached() {
        let feed = json!({ "list": [chat(3, "o"), chat(2, "o")], "cursorNo": 0 });
        let engine = engine(vec![feed]);
        let page = engine.messages("r", 2, None).await.unwrap();
        assert_eq!(page.iter().map(|m| m.chat_no).collect::<Vec<_>>(), [2, 3]);
        assert!(engine.store().message("c1", "r", 3).unwrap().is_some());
    }

    fn dated(no: i64, text: &str, at: i64) -> Value {
        let mut value = chat(no, "o");
        value["content"] = json!(text);
        value["createdAt"] = json!(at);
        value
    }

    fn query(keyword: &str) -> SearchQuery<'_> {
        SearchQuery {
            channel_id: "r",
            keyword,
            since: None,
            until: None,
            limit: 5,
        }
    }

    #[tokio::test]
    async fn search_answers_from_the_store_and_stops_when_the_limit_is_met() {
        let engine = engine(vec![]);
        for no in 1..=3 {
            engine
                .store()
                .upsert_message("c1", "r", no, &dated(no, "hello", no))
                .unwrap();
        }
        let found = engine
            .search(&SearchQuery {
                limit: 3,
                ..query("hello")
            })
            .await
            .unwrap();
        assert_eq!(found.hits.len(), 3);
        assert!(found.hits.iter().all(|hit| hit.source == "local"));
        assert!(engine.remote.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn search_tops_up_from_the_relay_without_repeating_a_local_hit() {
        let engine = engine(vec![
            json!({ "list": [dated(1, "hello old", 10), dated(2, "no", 20), dated(3, "hello new", 30)] }),
        ]);
        engine
            .store()
            .upsert_message("c1", "r", 3, &dated(3, "hello new", 30))
            .unwrap();
        let found = engine.search(&query("hello")).await.unwrap();
        let seen: Vec<(i64, &str)> = found
            .hits
            .iter()
            .map(|hit| (hit.message.chat_no, hit.source))
            .collect();
        assert_eq!(seen, [(3, "local"), (1, "relay")]);
        assert_eq!(found.relay_error, None);
    }

    #[tokio::test]
    async fn search_keeps_local_hits_and_reports_a_relay_failure() {
        let engine = engine(vec![]);
        engine
            .store()
            .upsert_message("c1", "r", 1, &dated(1, "hello", 5))
            .unwrap();
        let found = engine.search(&query("hello")).await.unwrap();
        assert_eq!(found.hits.len(), 1);
        assert!(found.relay_error.is_some());
    }

    #[tokio::test]
    async fn search_respects_the_time_window_on_relay_pages() {
        let engine = engine(vec![
            json!({ "list": [dated(1, "hello a", 10), dated(2, "hello b", 50)] }),
        ]);
        let found = engine
            .search(&SearchQuery {
                since: Some(40),
                until: Some(60),
                ..query("hello")
            })
            .await
            .unwrap();
        assert_eq!(found.hits.len(), 1);
        assert_eq!(found.hits[0].message.chat_no, 2);
    }

    #[tokio::test]
    async fn members_come_from_the_channel_user_list() {
        let engine = engine(vec![json!({ "list": [
            { "id": "u1", "name": "Mina", "$join": { "role": "owner", "joined": 1 } },
            { "id": "u2", "nick": "Jun", "$join": { "joined": 0, "joinedNo": 4 } },
        ] })]);
        let members = engine.members("r").await.unwrap();
        assert_eq!(members[0].role, "owner");
        assert_eq!(members[1].name.as_deref(), Some("Jun"));
        assert!(members[1].left && !members[0].left);
        let calls = engine.remote.calls.lock().unwrap();
        assert_eq!(calls[0].0, "channel.list-user");
    }

    #[tokio::test]
    async fn a_reaction_names_the_chat_and_the_direction() {
        let engine = engine(vec![json!({}), json!({})]);
        engine.react("r:1", "👍", true).await.unwrap();
        engine.react("r:1", "👍", false).await.unwrap();
        let calls = engine.remote.calls.lock().unwrap();
        assert_eq!(calls[0].1.as_ref().unwrap()["action"], "on");
        assert_eq!(calls[1].1.as_ref().unwrap()["action"], "off");
    }

    #[tokio::test]
    async fn an_incoming_mention_in_a_dm_is_stored_and_classified() {
        let engine = engine(vec![
            json!({ "list": [{ "id": "r", "stereo": "dm", "memberIds": ["me", "o"], "chatNo": 1 }] }),
        ]);
        engine.rooms().await.unwrap();
        let mut incoming = chat(7, "o");
        incoming["mention$"] = json!({ "userIds": ["me"] });
        let (message, kinds) = engine
            .ingest("chat.sync", &incoming, |_| false)
            .unwrap()
            .unwrap();
        assert_eq!(message.chat_no, 7);
        assert_eq!(kinds, [EventKind::Mention, EventKind::DirectMessage]);
        assert!(engine.store().message("c1", "r", 7).unwrap().is_some());
    }

    #[tokio::test]
    async fn a_reply_to_my_stored_message_is_a_thread_reply_to_me() {
        let engine = engine(vec![chat(2, "me")]);
        engine
            .send("r", "question", &SendOptions::default(), Origin::Person)
            .await
            .unwrap();
        let mut reply = chat(3, "o");
        reply["parentId"] = json!("r:2");
        let (_, kinds) = engine
            .ingest("chat.sync", &reply, |_| false)
            .unwrap()
            .unwrap();
        assert_eq!(kinds, [EventKind::ThreadReply]);
    }
}
