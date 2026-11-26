pub fn encode_uri_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

pub fn url_encode_value(input: &str) -> String {
    encode_uri_component(input)
        .replace('!', "%21")
        .replace('\'', "%27")
        .replace('(', "%28")
        .replace(')', "%29")
        .replace('*', "%2A")
}

pub fn axios_encode(input: &str) -> String {
    encode_uri_component(input)
        .replace("%3A", ":")
        .replace("%24", "$")
        .replace("%2C", ",")
        .replace("%20", "+")
        .replace("%5B", "[")
        .replace("%5D", "]")
}

pub fn js_string(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}
