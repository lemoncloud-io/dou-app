use dou_core::{Error, Result};
use serde_json::{Map, Value};

pub fn encode_request(ty: &str, data: Option<&Value>, mid: &str, as_user: Option<&str>) -> String {
    let mut map = Map::new();
    map.insert("type".into(), Value::String(ty.to_string()));
    map.insert("data".into(), data.cloned().unwrap_or(Value::Null));
    map.insert("mid".into(), Value::String(mid.to_string()));
    if let Some(user) = as_user {
        map.insert("as".into(), Value::String(user.to_string()));
    }
    Value::Object(map).to_string()
}

#[derive(Debug, Clone, PartialEq)]
pub enum Incoming {
    Ok {
        ty: String,
        mid: String,
        data: Value,
    },
    Failed {
        ty: String,
        mid: String,
        error: String,
        code: Option<i64>,
    },
    Event {
        ty: String,
        data: Value,
    },
}

pub fn parse_incoming(raw: &str) -> Result<Incoming> {
    let text = raw.trim();
    if text.is_empty() || !text.starts_with('{') || !text.ends_with('}') {
        return Err(Error::InvalidResponse("invalid socket JSON message".into()));
    }
    let value: Value =
        serde_json::from_str(text).map_err(|e| Error::InvalidResponse(e.to_string()))?;
    let ty = value
        .get("type")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .ok_or_else(|| Error::InvalidResponse("message.type is required".into()))?
        .to_string();
    let mid = value.get("mid").and_then(Value::as_str).map(str::to_string);
    let data = value.get("data").cloned().unwrap_or(Value::Null);
    match mid {
        Some(mid) => {
            if let Some(base) = ty.strip_suffix(":error") {
                let error = value
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown error")
                    .to_string();
                Ok(Incoming::Failed {
                    ty: base.to_string(),
                    mid,
                    error,
                    code: value.get("errorCode").and_then(Value::as_i64),
                })
            } else {
                let base = ty.strip_suffix(":ok").unwrap_or(&ty).to_string();
                Ok(Incoming::Ok {
                    ty: base,
                    mid,
                    data,
                })
            }
        }
        None => Ok(Incoming::Event { ty, data }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_request_keeps_the_key_order_type_data_mid_as() {
        let data = json!({ "channelId": "c1" });
        let text = encode_request("chat.feed", Some(&data), "m-1-abcdef", Some("u1"));
        assert_eq!(
            text,
            r#"{"type":"chat.feed","data":{"channelId":"c1"},"mid":"m-1-abcdef","as":"u1"}"#
        );
    }

    #[test]
    fn an_empty_payload_is_null_and_as_is_left_out() {
        assert_eq!(
            encode_request("channel.mine", None, "m-1-a", None),
            r#"{"type":"channel.mine","data":null,"mid":"m-1-a"}"#
        );
    }

    #[test]
    fn a_reply_with_a_mid_settles_and_a_frame_without_one_is_an_event() {
        let ok = parse_incoming(r#"{"type":"chat.feed:ok","mid":"m","data":{"list":[]}}"#).unwrap();
        assert!(matches!(ok, Incoming::Ok { ref ty, .. } if ty == "chat.feed"));
        let failed = parse_incoming(
            r#"{"type":"chat.send:error","mid":"m","error":"403 NOT ALLOWED","errorCode":403}"#,
        )
        .unwrap();
        assert!(matches!(
            failed,
            Incoming::Failed {
                code: Some(403),
                ..
            }
        ));
        let event = parse_incoming(r#"{"type":"chat.sync","data":{"chatNo":2}}"#).unwrap();
        assert!(matches!(event, Incoming::Event { ref ty, .. } if ty == "chat.sync"));
    }

    #[test]
    fn a_non_json_object_is_refused() {
        assert!(parse_incoming("pong").is_err());
        assert!(parse_incoming(r#"{"data":1}"#).is_err());
    }
}
