use std::sync::atomic::{AtomicUsize, Ordering};

use serde_json::{Value, json};

use crate::{DATA_LIMIT, Entry, Refusal, TITLE_LIMIT};

pub const ERROR_MESSAGE_LIMIT: usize = 1000;
pub const ERROR_STACK_LIMIT: usize = 4000;
pub const ERROR_REPORTS_PER_LOAD: usize = 20;

fn fail(response_type: &str, code: &str, message: &str) -> Value {
    json!({
        "type": response_type,
        "success": false,
        "error": { "code": code, "message": message },
    })
}

pub fn context(entry: &Entry, app_version: &str, locale: &str, dark: bool) -> Value {
    json!({
        "protocolVersion": 1,
        "viewId": entry.view_id,
        "platform": "desktop",
        "appVersion": app_version,
        "locale": locale,
        "theme": if dark { "dark" } else { "light" },
        "params": entry.params,
    })
}

pub fn fits_data(value: &Value) -> bool {
    value.to_string().len() <= DATA_LIMIT
}

pub fn finish_reply(
    message: &Value,
    close: impl FnOnce(Option<&Value>) -> Result<(), Refusal>,
) -> Value {
    let result = message["data"].get("result").filter(|r| !r.is_null());
    if result.is_some_and(|result| !fits_data(result)) {
        return fail(
            "OnFinishSubWebView",
            "INVALID",
            "result must be JSON of at most 16 KiB.",
        );
    }
    match close(result) {
        Ok(()) => json!({ "type": "OnFinishSubWebView", "success": true, "data": {} }),
        Err(refusal) => fail(
            "OnFinishSubWebView",
            refusal.code(),
            "This view is no longer showing.",
        ),
    }
}

pub fn title_reply(message: &Value, set: impl FnOnce(String)) -> Value {
    let title = message["data"]["title"].as_str().map_or("", str::trim);
    if title.is_empty() || title.chars().count() > TITLE_LIMIT {
        return fail(
            "OnSetSubWebViewTitle",
            "INVALID",
            "title must be 1 to 100 characters.",
        );
    }
    set(title.to_string());
    json!({ "type": "OnSetSubWebViewTitle", "success": true, "data": {} })
}

#[derive(Debug, PartialEq, Eq)]
pub struct PageError {
    pub origin: String,
    pub message: String,
    pub stack: Option<String>,
}

#[derive(Default)]
pub struct ErrorReports(AtomicUsize);

impl ErrorReports {
    pub fn reply(&self, message: &Value, origin: &str, log: impl FnOnce(PageError)) -> Value {
        let text = message["data"]["message"].as_str().unwrap_or("");
        if text.trim().is_empty() {
            return fail(
                "OnReportSubWebViewError",
                "INVALID",
                "message must be a non-empty string.",
            );
        }
        if self.0.fetch_add(1, Ordering::Relaxed) >= ERROR_REPORTS_PER_LOAD {
            return json!({ "type": "OnReportSubWebViewError", "success": true, "data": { "recorded": false } });
        }
        log(PageError {
            origin: origin.to_string(),
            message: text.chars().take(ERROR_MESSAGE_LIMIT).collect(),
            stack: message["data"]["stack"]
                .as_str()
                .map(|stack| stack.chars().take(ERROR_STACK_LIMIT).collect()),
        });
        json!({ "type": "OnReportSubWebViewError", "success": true, "data": { "recorded": true } })
    }
}

fn literal(value: &Value) -> String {
    value
        .to_string()
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

pub fn page_script(origin: &str, context: &Value) -> String {
    let origin = literal(&Value::String(origin.to_string()));
    let context = literal(&Value::String(context.to_string()));
    format!(
        "(function () {{
if (window.location.origin !== {origin}) return;
const invoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
if (!invoke) return;
const freeze = function (value) {{
    if (value && typeof value === 'object') {{
        Object.keys(value).forEach(function (key) {{ freeze(value[key]); }});
        Object.freeze(value);
    }}
    return value;
}};
if (!Object.prototype.hasOwnProperty.call(window, 'ChaticSubWebView')) {{
    Object.defineProperty(window, 'ChaticSubWebView', {{
        value: freeze(JSON.parse({context})),
        enumerable: true,
        writable: false,
        configurable: false,
    }});
}}
Object.defineProperty(window, 'ReactNativeWebView', {{
    value: Object.freeze({{
        postMessage: function (message) {{
            if (typeof message === 'string') invoke('sub_bridge_request', {{ message: message }}).catch(function () {{}});
        }},
    }}),
}});
window.addEventListener('keydown', function (event) {{
    if (event.key === 'Escape') {{
        event.preventDefault();
        invoke('sub_close_request', {{}}).catch(function () {{}});
    }}
}}, true);
}})();"
    )
}

pub fn deliver_script(origin: &str, message: &str) -> String {
    format!(
        "if (location.origin === {}) window.dispatchEvent(new MessageEvent('message', {{ data: {} }}));",
        literal(&Value::String(origin.to_string())),
        literal(&Value::String(message.to_string())),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Trust, parse_open};

    fn entry() -> Entry {
        let request =
            parse_open(&json!({ "url": "https://calc.apps.chatic.io", "params": { "a": 1 } }))
                .expect("request");
        Entry {
            view_id: "sub-1".into(),
            url: request.url,
            origin: request.origin,
            trust: Trust::Reviewed,
            title: None,
            params: request.params,
            dev: false,
        }
    }

    #[test]
    fn the_context_carries_the_view_the_platform_and_the_params() {
        let value = context(&entry(), "1.2.3", "ko", true);
        assert_eq!(value["protocolVersion"], 1);
        assert_eq!(value["viewId"], "sub-1");
        assert_eq!(value["platform"], "desktop");
        assert_eq!(value["theme"], "dark");
        assert_eq!(value["params"]["a"], 1);
    }

    #[test]
    fn finishing_passes_the_result_and_reports_a_closed_view() {
        let mut seen = None;
        let ok = finish_reply(&json!({ "data": { "result": { "n": 2 } } }), |result| {
            seen = result.cloned();
            Ok(())
        });
        assert_eq!(ok["success"], true);
        assert_eq!(seen, Some(json!({ "n": 2 })));
        let gone = finish_reply(&json!({ "data": {} }), |_| Err(Refusal::NotOpen));
        assert_eq!(gone["error"]["code"], "NOT_OPEN");
        assert_eq!(gone["type"], "OnFinishSubWebView");
    }

    #[test]
    fn a_result_over_sixteen_kib_is_refused_before_closing() {
        let big = "x".repeat(DATA_LIMIT);
        let mut closed = false;
        let reply = finish_reply(&json!({ "data": { "result": big } }), |_| {
            closed = true;
            Ok(())
        });
        assert_eq!(reply["error"]["code"], "INVALID");
        assert!(!closed);
    }

    #[test]
    fn a_title_is_trimmed_and_bounded() {
        let mut set = None;
        let ok = title_reply(&json!({ "data": { "title": "  Hi  " } }), |t| set = Some(t));
        assert_eq!(ok["success"], true);
        assert_eq!(set.as_deref(), Some("Hi"));
        for bad in [
            json!({ "data": {} }),
            json!({ "data": { "title": "  " } }),
            json!({ "data": { "title": "t".repeat(101) } }),
            json!({ "data": { "title": 5 } }),
        ] {
            assert_eq!(
                title_reply(&bad, |_| panic!("set"))["error"]["code"],
                "INVALID"
            );
        }
    }

    #[test]
    fn error_reports_are_cut_and_capped_at_twenty_per_load() {
        let reports = ErrorReports::default();
        let mut logged = Vec::new();
        let long = "m".repeat(ERROR_MESSAGE_LIMIT + 5);
        let first = reports.reply(
            &json!({ "data": { "message": long, "stack": "s".repeat(5000) } }),
            "https://o",
            |e| logged.push(e),
        );
        assert_eq!(first["data"]["recorded"], true);
        assert_eq!(logged[0].message.len(), ERROR_MESSAGE_LIMIT);
        assert_eq!(
            logged[0].stack.as_ref().map(String::len),
            Some(ERROR_STACK_LIMIT)
        );
        for _ in 1..ERROR_REPORTS_PER_LOAD {
            reports.reply(&json!({ "data": { "message": "x" } }), "https://o", |e| {
                logged.push(e)
            });
        }
        assert_eq!(logged.len(), ERROR_REPORTS_PER_LOAD);
        let extra = reports.reply(&json!({ "data": { "message": "x" } }), "https://o", |_| {
            panic!("log")
        });
        assert_eq!(extra["data"]["recorded"], false);
        let blank = reports.reply(&json!({ "data": { "message": " " } }), "https://o", |_| {});
        assert_eq!(blank["error"]["code"], "INVALID");
    }

    #[test]
    fn the_page_script_guards_the_origin_and_escapes_what_it_embeds() {
        let ctx = context(&entry(), "1", "en", false);
        let script = page_script("https://calc.apps.chatic.io", &ctx);
        assert!(script.contains("window.location.origin !== \"https://calc.apps.chatic.io\""));
        assert!(script.contains("sub_bridge_request"));
        assert!(script.contains("ChaticSubWebView"));
        let tricky = deliver_script("https://o", "a\u{2028}b\"</script>");
        assert!(!tricky.contains('\u{2028}'));
        assert!(tricky.contains("\\u2028"));
    }
}
