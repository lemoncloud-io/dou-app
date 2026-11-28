use std::sync::Mutex;

use serde_json::Value;

pub mod page;
pub mod policy;

const HUB_HOSTS: [&str; 2] = ["apps.chatic.io", "apps-dev.chatic.io"];
pub const DATA_LIMIT: usize = 16 * 1024;
pub const TITLE_LIMIT: usize = 100;
pub const MESSAGE_LIMIT: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trust {
    FirstParty,
    Reviewed,
    External,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    Invalid,
    NotAllowed,
    AlreadyOpen,
    NotOpen,
}

impl Refusal {
    pub fn code(self) -> &'static str {
        match self {
            Refusal::Invalid => "INVALID",
            Refusal::NotAllowed => "NOT_ALLOWED",
            Refusal::AlreadyOpen => "ALREADY_OPEN",
            Refusal::NotOpen => "NOT_OPEN",
        }
    }

    pub fn message(self) -> &'static str {
        match self {
            Refusal::Invalid => {
                "An https url is required; title must be a string, params a JSON object of at most 16 KiB and appId one lower-case label."
            }
            Refusal::NotAllowed => {
                "This shell does not open the url: it is not plain https, or could be read two ways."
            }
            Refusal::AlreadyOpen => "A sub WebView is already showing.",
            Refusal::NotOpen => "No sub WebView with this viewId is showing.",
        }
    }
}

fn is_label(label: &str) -> bool {
    let bytes = label.as_bytes();
    let (Some(first), Some(last)) = (bytes.first(), bytes.last()) else {
        return false;
    };
    let edge = |b: &u8| b.is_ascii_alphanumeric();
    edge(first)
        && edge(last)
        && bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || *b == b'-')
}

fn numeric_label(label: &str) -> bool {
    let lower = label.to_ascii_lowercase();
    lower.chars().all(|c| c.is_ascii_digit()) && !lower.is_empty()
        || lower
            .strip_prefix("0x")
            .is_some_and(|rest| rest.chars().all(|c| c.is_ascii_hexdigit()))
}

pub fn host_of(url: &str) -> Option<String> {
    if url
        .chars()
        .any(|c| c == '\\' || c.is_whitespace() || c.is_control())
    {
        return None;
    }
    let rest = url
        .get(..8)
        .filter(|p| p.eq_ignore_ascii_case("https://"))
        .map(|_| &url[8..])?;
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let host = &rest[..end];
    let labels: Vec<&str> = host.split('.').collect();
    if labels.len() < 2 || !labels.iter().all(|l| is_label(l)) {
        return None;
    }
    if labels.last().is_some_and(|l| numeric_label(l)) {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

pub fn origin_of(url: &str) -> Option<String> {
    host_of(url).map(|host| format!("https://{host}"))
}

pub fn local_origin_of(url: &str) -> Option<String> {
    if url
        .chars()
        .any(|c| c == '\\' || c.is_whitespace() || c.is_control())
    {
        return None;
    }
    let rest = url
        .get(..7)
        .filter(|p| p.eq_ignore_ascii_case("http://"))
        .map(|_| &url[7..])?;
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = rest[..end].to_ascii_lowercase();
    let port = match authority.strip_prefix("localhost") {
        Some("") => None,
        Some(tail) => Some(tail.strip_prefix(':')?),
        None => return None,
    };
    if let Some(port) = port
        && (port.is_empty()
            || !port.chars().all(|c| c.is_ascii_digit())
            || port.parse::<u16>().is_err())
    {
        return None;
    }
    Some(format!("http://{authority}"))
}

pub fn trust_of(url: &str) -> Option<Trust> {
    let host = host_of(url)?;
    if HUB_HOSTS.contains(&host.as_str()) {
        return Some(Trust::FirstParty);
    }
    let parent = host.split_once('.').map(|(_, rest)| rest)?;
    Some(if HUB_HOSTS.contains(&parent) {
        Trust::Reviewed
    } else {
        Trust::External
    })
}

fn is_app_id(value: &str) -> bool {
    value.len() <= 63 && is_label(value) && value.chars().all(|c| !c.is_ascii_uppercase())
}

#[derive(Debug, PartialEq, Eq)]
pub struct OpenRequest {
    pub url: String,
    pub origin: String,
    pub trust: Trust,
    pub title: Option<String>,
    pub params: Value,
    pub app_id: Option<String>,
}

pub fn parse_dev(url: &str) -> Result<OpenRequest, Refusal> {
    let Some(origin) = local_origin_of(url) else {
        return parse_open(&serde_json::json!({ "url": url }));
    };
    Ok(OpenRequest {
        url: url.to_string(),
        origin,
        trust: Trust::Reviewed,
        title: None,
        params: Value::Object(Default::default()),
        app_id: None,
    })
}

pub fn parse_open(data: &Value) -> Result<OpenRequest, Refusal> {
    let url = data["url"].as_str().ok_or(Refusal::Invalid)?;
    let title = match data.get("title") {
        None | Some(Value::Null) => None,
        Some(Value::String(title)) => Some(title.chars().take(TITLE_LIMIT).collect()),
        Some(_) => return Err(Refusal::Invalid),
    };
    let params = match data.get("params") {
        None | Some(Value::Null) => Value::Object(Default::default()),
        Some(params @ Value::Object(_)) if params.to_string().len() <= DATA_LIMIT => params.clone(),
        Some(_) => return Err(Refusal::Invalid),
    };
    let app_id = match data.get("appId") {
        None | Some(Value::Null) => None,
        Some(Value::String(id)) if is_app_id(id) => Some(id.clone()),
        Some(_) => return Err(Refusal::Invalid),
    };
    let origin = origin_of(url).ok_or(Refusal::NotAllowed)?;
    let trust = trust_of(url).ok_or(Refusal::NotAllowed)?;
    Ok(OpenRequest {
        url: url.to_string(),
        origin,
        trust,
        title,
        params,
        app_id,
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct Entry {
    pub view_id: String,
    pub url: String,
    pub origin: String,
    pub trust: Trust,
    pub title: Option<String>,
    pub params: Value,
    pub dev: bool,
}

#[derive(Default)]
pub struct Views {
    state: Mutex<(u64, Option<Entry>)>,
}

impl Views {
    pub fn open(&self, request: &OpenRequest, dev: bool) -> Result<Entry, Refusal> {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.1.is_some() {
            return Err(Refusal::AlreadyOpen);
        }
        state.0 += 1;
        let entry = Entry {
            view_id: format!("sub-{}", state.0),
            url: request.url.clone(),
            origin: request.origin.clone(),
            trust: request.trust,
            title: request.title.clone(),
            params: request.params.clone(),
            dev,
        };
        state.1 = Some(entry.clone());
        Ok(entry)
    }

    pub fn current(&self) -> Option<Entry> {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .1
            .clone()
    }

    pub fn list(&self) -> Vec<Entry> {
        self.current().into_iter().collect()
    }

    pub fn close(&self, view_id: Option<&str>) -> Result<Entry, Refusal> {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match (&state.1, view_id) {
            (Some(current), Some(asked)) if current.view_id == asked => {
                state.1.take().ok_or(Refusal::NotOpen)
            }
            _ => Err(Refusal::NotOpen),
        }
    }

    pub fn closed(&self, view_id: &str) -> bool {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.1.as_ref().is_some_and(|e| e.view_id == view_id) {
            state.1 = None;
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn plain_https_hosts_open_and_everything_ambiguous_does_not() {
        assert_eq!(
            origin_of("https://Apps.Chatic.io/x?y#z").as_deref(),
            Some("https://apps.chatic.io")
        );
        for bad in [
            "http://apps.chatic.io",
            "https://user@apps.chatic.io",
            "https://apps.chatic.io:8443",
            "https://apps.chatic.io\\@evil.example",
            "https://apps chatic.io",
            "https://127.0.0.1",
            "https://0x7f.1",
            "https://localhost",
            "https://-a.example.com",
            "https://a..example.com",
            "https://a.example.com\n",
        ] {
            assert_eq!(origin_of(bad), None, "{bad}");
        }
    }

    #[test]
    fn trust_follows_the_hub_domains() {
        assert_eq!(trust_of("https://apps.chatic.io"), Some(Trust::FirstParty));
        assert_eq!(
            trust_of("https://apps-dev.chatic.io/a"),
            Some(Trust::FirstParty)
        );
        assert_eq!(
            trust_of("https://calc.apps.chatic.io"),
            Some(Trust::Reviewed)
        );
        assert_eq!(
            trust_of("https://a.b.apps.chatic.io"),
            Some(Trust::External)
        );
        assert_eq!(trust_of("https://example.com"), Some(Trust::External));
        assert_eq!(trust_of("ftp://example.com"), None);
    }

    #[test]
    fn an_open_request_is_checked_field_by_field() {
        let ok = parse_open(
            &json!({ "url": "https://example.com/a", "title": "T", "appId": "calc", "params": { "a": 1 } }),
        );
        assert_eq!(ok.as_ref().map(|r| r.trust), Ok(Trust::External));
        assert_eq!(parse_open(&json!({})), Err(Refusal::Invalid));
        assert_eq!(
            parse_open(&json!({ "url": "https://example.com", "title": 5 })),
            Err(Refusal::Invalid)
        );
        assert_eq!(
            parse_open(&json!({ "url": "https://example.com", "params": [1] })),
            Err(Refusal::Invalid)
        );
        assert_eq!(
            parse_open(&json!({ "url": "https://example.com", "appId": "Bad_Id" })),
            Err(Refusal::Invalid)
        );
        let big = "x".repeat(DATA_LIMIT);
        assert_eq!(
            parse_open(&json!({ "url": "https://example.com", "params": { "a": big } })),
            Err(Refusal::Invalid)
        );
        assert_eq!(
            parse_open(&json!({ "url": "http://example.com" })),
            Err(Refusal::NotAllowed)
        );
    }

    #[test]
    fn a_long_title_is_cut() {
        let long = "t".repeat(500);
        let request =
            parse_open(&json!({ "url": "https://example.com", "title": long })).expect("request");
        assert_eq!(request.title.map(|t| t.chars().count()), Some(TITLE_LIMIT));
    }

    fn request() -> OpenRequest {
        parse_open(&json!({ "url": "https://example.com" })).expect("request")
    }

    #[test]
    fn one_view_at_a_time_and_a_close_must_name_it() {
        let views = Views::default();
        let id = views.open(&request(), false).expect("first").view_id;
        assert_eq!(views.open(&request(), false), Err(Refusal::AlreadyOpen));
        assert_eq!(views.close(Some("sub-99")), Err(Refusal::NotOpen));
        assert_eq!(views.close(None), Err(Refusal::NotOpen));
        assert_eq!(views.close(Some(&id)).map(|e| e.view_id), Ok(id.clone()));
        assert_eq!(views.close(Some(&id)), Err(Refusal::NotOpen));
        let next = views.open(&request(), false).expect("second").view_id;
        assert_ne!(next, id);
        assert!(!views.closed(&id));
        assert!(views.closed(&next));
        assert!(!views.closed(&next));
    }

    #[test]
    fn the_open_entry_is_listed_with_what_the_request_carried() {
        let views = Views::default();
        assert!(views.list().is_empty());
        let request = parse_open(
            &json!({ "url": "https://calc.apps.chatic.io/x", "title": "T", "params": { "a": 1 } }),
        )
        .expect("request");
        let entry = views.open(&request, false).expect("open");
        assert_eq!(views.list(), vec![entry.clone()]);
        assert_eq!(entry.origin, "https://calc.apps.chatic.io");
        assert_eq!(entry.trust, Trust::Reviewed);
        assert_eq!(entry.params["a"], 1);
        assert!(!entry.dev);
    }

    #[test]
    fn a_dev_url_may_be_plain_http_on_localhost_only() {
        let local = parse_dev("http://localhost:5100/index.html").expect("local");
        assert_eq!(local.origin, "http://localhost:5100");
        assert_eq!(local.trust, Trust::Reviewed);
        assert_eq!(
            parse_dev("https://example.com").map(|r| r.trust),
            Ok(Trust::External)
        );
        for bad in [
            "http://example.com",
            "http://localhost.evil.com",
            "http://localhost:99999",
            "http://localhost:",
            "http://user@localhost:80",
            "http://127.0.0.1:80",
        ] {
            assert!(parse_dev(bad).is_err(), "{bad}");
        }
        assert_eq!(
            parse_open(&json!({ "url": "http://localhost:5100" })),
            Err(Refusal::NotAllowed)
        );
    }
}
