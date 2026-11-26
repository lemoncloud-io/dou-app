use crate::model::Message;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventKind {
    Mention,
    DirectMessage,
    ThreadReply,
    RoomMessage,
}

impl EventKind {
    pub fn as_str(self) -> &'static str {
        match self {
            EventKind::Mention => "mention",
            EventKind::DirectMessage => "dm",
            EventKind::ThreadReply => "thread_reply",
            EventKind::RoomMessage => "room_message",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ChatContext<'a> {
    pub me: &'a str,
    pub room_is_dm: bool,
    pub room_is_allowed: bool,
    pub parent_owner_id: Option<&'a str>,
}

pub fn classify_chat(message: &Message, context: &ChatContext<'_>) -> Vec<EventKind> {
    if message.owner_id == context.me || message.stereo == "system" {
        return Vec::new();
    }
    let mut kinds = Vec::new();
    if message.mention_all || message.mention_user_ids.iter().any(|id| id == context.me) {
        kinds.push(EventKind::Mention);
    }
    if context.room_is_dm {
        kinds.push(EventKind::DirectMessage);
    }
    if message.parent_id.is_some() && context.parent_owner_id == Some(context.me) {
        kinds.push(EventKind::ThreadReply);
    }
    if context.room_is_allowed {
        kinds.push(EventKind::RoomMessage);
    }
    kinds
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message() -> Message {
        Message {
            id: "r:5".into(),
            channel_id: "r".into(),
            chat_no: 5,
            owner_id: "other".into(),
            owner_name: None,
            content: "hi".into(),
            stereo: "text".into(),
            parent_id: None,
            mention_user_ids: vec![],
            mention_all: false,
            created_at: 0,
        }
    }

    fn context<'a>() -> ChatContext<'a> {
        ChatContext {
            me: "me",
            room_is_dm: false,
            room_is_allowed: false,
            parent_owner_id: None,
        }
    }

    #[test]
    fn my_own_message_raises_nothing() {
        let mut own = message();
        own.owner_id = "me".into();
        own.mention_user_ids = vec!["me".into()];
        assert!(classify_chat(&own, &context()).is_empty());
    }

    #[test]
    fn a_mention_of_me_and_an_at_all_both_count() {
        let mut one = message();
        one.mention_user_ids = vec!["me".into()];
        assert_eq!(classify_chat(&one, &context()), [EventKind::Mention]);
        let mut all = message();
        all.mention_all = true;
        assert_eq!(classify_chat(&all, &context()), [EventKind::Mention]);
    }

    #[test]
    fn a_plain_message_in_a_room_outside_the_allow_list_is_not_an_event() {
        assert!(classify_chat(&message(), &context()).is_empty());
    }

    #[test]
    fn a_dm_a_thread_reply_to_me_and_an_allowed_room_each_count() {
        let mut reply = message();
        reply.parent_id = Some("r:2".into());
        let ctx = ChatContext {
            room_is_dm: true,
            room_is_allowed: true,
            parent_owner_id: Some("me"),
            ..context()
        };
        assert_eq!(
            classify_chat(&reply, &ctx),
            [
                EventKind::DirectMessage,
                EventKind::ThreadReply,
                EventKind::RoomMessage
            ]
        );
    }

    #[test]
    fn a_reply_to_someone_elses_message_is_not_a_thread_reply_to_me() {
        let mut reply = message();
        reply.parent_id = Some("r:2".into());
        let ctx = ChatContext {
            parent_owner_id: Some("third"),
            ..context()
        };
        assert!(classify_chat(&reply, &ctx).is_empty());
    }
}
