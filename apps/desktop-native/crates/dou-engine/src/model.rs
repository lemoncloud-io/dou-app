use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct Room {
    pub id: String,
    pub name: Option<String>,
    pub stereo: String,
    pub member_ids: Vec<String>,
    pub chat_no: i64,
    pub unread: i64,
    pub notify: Option<String>,
}

fn text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

impl Room {
    pub fn from_json(value: &Value) -> Option<Self> {
        Some(Self {
            id: text(value, "id")?,
            name: text(value, "name"),
            stereo: text(value, "stereo").unwrap_or_default(),
            member_ids: value
                .get("memberIds")
                .and_then(Value::as_array)
                .map(|ids| {
                    ids.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default(),
            chat_no: value.get("chatNo").and_then(Value::as_i64).unwrap_or(0),
            unread: value
                .get("unreadCount")
                .and_then(Value::as_i64)
                .unwrap_or(0),
            notify: value.get("$join").and_then(|join| text(join, "notify")),
        })
    }

    pub fn title(&self, me: &str) -> String {
        if let Some(name) = self.name.as_ref().filter(|n| !n.is_empty()) {
            return name.clone();
        }
        let others: Vec<&str> = self
            .member_ids
            .iter()
            .map(String::as_str)
            .filter(|id| *id != me)
            .collect();
        if others.is_empty() {
            self.id.clone()
        } else {
            others.join(", ")
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Message {
    pub id: String,
    pub channel_id: String,
    pub chat_no: i64,
    pub owner_id: String,
    pub owner_name: Option<String>,
    pub content: String,
    pub stereo: String,
    pub parent_id: Option<String>,
    pub mention_user_ids: Vec<String>,
    pub mention_all: bool,
    pub created_at: i64,
}

impl Message {
    pub fn from_json(value: &Value) -> Option<Self> {
        let mention = value.get("mention$");
        Some(Self {
            id: text(value, "id")?,
            channel_id: text(value, "channelId")?,
            chat_no: value.get("chatNo").and_then(Value::as_i64)?,
            owner_id: text(value, "ownerId").unwrap_or_default(),
            owner_name: value.get("owner$").and_then(|o| text(o, "name")),
            content: text(value, "content").unwrap_or_default(),
            stereo: text(value, "stereo").unwrap_or_default(),
            parent_id: text(value, "parentId"),
            mention_user_ids: mention
                .and_then(|m| m.get("userIds"))
                .and_then(Value::as_array)
                .map(|ids| {
                    ids.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default(),
            mention_all: mention
                .and_then(|m| m.get("all"))
                .is_some_and(|all| all == &Value::Bool(true) || all == &Value::from(1)),
            created_at: value.get("createdAt").and_then(Value::as_i64).unwrap_or(0),
        })
    }
}
