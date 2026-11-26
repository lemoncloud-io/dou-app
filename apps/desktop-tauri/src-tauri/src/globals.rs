use serde_json::{Value, json};

pub struct ShellInfo {
    pub device_id: String,
    pub stage: String,
    pub version: String,
    pub language: String,
    pub model: String,
}

pub fn info_value(info: &ShellInfo) -> Value {
    json!({
        "CHATIC_APP_PLATFORM": "desktop",
        "CHATIC_APP_APPLICATION": "chatic-desktop-tauri",
        "CHATIC_APP_STAGE": info.stage,
        "CHATIC_APP_DEVICE_ID": info.device_id,
        "CHATIC_APP_DEVICE_MODEL": info.model,
        "CHATIC_APP_CURRENT_VERSION": info.version,
        "CHATIC_APP_BUILD_NUMBER": "1",
        "CHATIC_APP_CURRENT_LANGUAGE": info.language,
        "CHATIC_APP_INSTALLATION_ID": info.device_id,
        "CHATIC_APP_LATEST_VERSION": info.version,
        "CHATIC_APP_SHOULD_UPDATE": "false",
        "CHATIC_APP_CAPABILITIES": { "version": 1, "checkout": [] },
    })
}

pub fn init_script(info: &ShellInfo, origin: &str) -> String {
    let info = info_value(info);
    let origin = Value::String(origin.to_string());
    format!(
        "(() => {{\n\
         if (location.origin !== {origin}) return;\n\
         Object.assign(window, {info});\n\
         const invoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;\n\
         if (!invoke) return;\n\
         const handler = Object.freeze({{\n\
         postMessage: message => {{\n\
         if (typeof message === 'string') invoke('bridge_request', {{ message }}).catch(() => {{}});\n\
         }},\n\
         }});\n\
         Object.defineProperty(window, 'ChaticMessageHandler', {{ value: handler }});\n\
         }})();"
    )
}

pub fn language_subtag(locale: Option<&str>) -> String {
    locale
        .and_then(|l| l.split(['-', '_']).next())
        .filter(|s| !s.is_empty())
        .map(str::to_lowercase)
        .unwrap_or_else(|| "en".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn info() -> ShellInfo {
        ShellInfo {
            device_id: "dev-1".into(),
            stage: "dev".into(),
            version: "0.0.1".into(),
            language: "ko".into(),
            model: "macos".into(),
        }
    }

    #[test]
    fn the_globals_carry_the_keys_the_web_reads() {
        let value = info_value(&info());
        assert_eq!(value["CHATIC_APP_PLATFORM"], "desktop");
        assert_eq!(value["CHATIC_APP_DEVICE_ID"], "dev-1");
        assert_eq!(value["CHATIC_APP_INSTALLATION_ID"], "dev-1");
        assert_eq!(value["CHATIC_APP_CAPABILITIES"]["checkout"], json!([]));
        assert_eq!(value["CHATIC_APP_CAPABILITIES"]["version"], 1);
    }

    #[test]
    fn the_script_runs_only_on_the_web_origin_and_exposes_one_handler() {
        let script = init_script(&info(), "https://dou-dev.chatic.io");
        assert!(script.contains("location.origin !== \"https://dou-dev.chatic.io\""));
        assert!(script.contains("ChaticMessageHandler"));
        assert!(script.contains("bridge_request"));
    }

    #[test]
    fn an_origin_cannot_break_out_of_the_script_string() {
        let script = init_script(&info(), "https://a\"; alert(1); \"");
        assert!(script.contains("\\\"; alert(1); \\\""));
    }

    #[test]
    fn the_language_is_the_bare_lower_case_subtag() {
        assert_eq!(language_subtag(Some("ko-KR")), "ko");
        assert_eq!(language_subtag(Some("pt_BR")), "pt");
        assert_eq!(language_subtag(None), "en");
        assert_eq!(language_subtag(Some("")), "en");
    }
}
