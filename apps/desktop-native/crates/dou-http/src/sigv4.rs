use std::collections::BTreeMap;

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

use dou_core::{Error, Result};

use crate::encode::{encode_uri_component, url_encode_value};

const AWS_SHA_256: &str = "AWS4-HMAC-SHA256";
const AWS4_REQUEST: &str = "aws4_request";
const SERVICE: &str = "execute-api";
const DEFAULT_TYPE: &str = "application/json";

#[derive(Debug, Clone)]
pub struct Credential {
    pub access_key: String,
    pub secret_key: String,
    pub session_token: Option<String>,
}

pub struct SignInput<'a> {
    pub credential: &'a Credential,
    pub region: &'a str,
    pub endpoint: &'a str,
    pub method: &'a str,
    pub params: &'a [(String, String)],
    pub body: Option<&'a serde_json::Value>,
    pub now: &'a str,
}

fn sha256_hex(value: &str) -> String {
    hex(&Sha256::digest(value.as_bytes()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hmac_bytes(key: &[u8], value: &str) -> Result<Vec<u8>> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).map_err(|_| Error::InvalidKey)?;
    mac.update(value.as_bytes());
    Ok(mac.finalize().into_bytes().to_vec())
}

fn uri_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '_' | '-' | '~' | '.' | '/' => out.push(ch),
            '*' => out.push_str("%2A"),
            '!' => out.push_str("%21"),
            '(' => out.push_str("%28"),
            ')' => out.push_str("%29"),
            other => out.push_str(&encode_uri_component(&other.to_string())),
        }
    }
    out
}

fn canonical_query(params: &[(String, String)]) -> String {
    let mut sorted: Vec<&(String, String)> = params.iter().collect();
    sorted.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
    sorted
        .iter()
        .map(|(key, value)| format!("{key}={}", url_encode_value(value)))
        .collect::<Vec<_>>()
        .join("&")
}

fn amz_date(now: &str) -> String {
    let trimmed = match now.rfind('.') {
        Some(dot) if now.ends_with('Z') && now.len() - dot == 5 => format!("{}Z", &now[..dot]),
        _ => now.to_string(),
    };
    trimmed.replace([':', '-'], "")
}

fn host_of(url: &str) -> String {
    let host = if url.contains("//") {
        url.split('/').nth(2).unwrap_or("")
    } else {
        url.split('/').next().unwrap_or("")
    };
    let host = host.split(':').next().unwrap_or("");
    host.split('?').next().unwrap_or("").to_string()
}

fn payload_of(method: &str, body: Option<&serde_json::Value>) -> String {
    if method.eq_ignore_ascii_case("get") {
        return String::new();
    }
    match body {
        Some(serde_json::Value::String(s)) if !s.is_empty() => s.clone(),
        Some(serde_json::Value::Number(n)) if n.as_f64() != Some(0.0) => n.to_string(),
        Some(serde_json::Value::Bool(true)) => "true".to_string(),
        Some(value @ (serde_json::Value::Object(_) | serde_json::Value::Array(_))) => {
            value.to_string()
        }
        _ => "{}".to_string(),
    }
}

pub fn sign_request(input: &SignInput<'_>) -> Result<BTreeMap<String, String>> {
    let verb = input.method.to_ascii_uppercase();
    let origin_len = input
        .endpoint
        .strip_prefix("https://")
        .map(|rest| ("https://".len(), rest))
        .or_else(|| {
            input
                .endpoint
                .strip_prefix("http://")
                .map(|rest| ("http://".len(), rest))
        })
        .map_or(0, |(prefix, rest)| {
            prefix + rest.find('/').unwrap_or(rest.len())
        });
    let path = &input.endpoint[origin_len..];

    let payload = payload_of(input.method, input.body);
    let datetime = amz_date(input.now);
    let host = host_of(input.endpoint);

    let mut headers: BTreeMap<String, String> = BTreeMap::new();
    headers.insert("Accept".into(), DEFAULT_TYPE.into());
    if !payload.is_empty() {
        headers.insert("Content-Type".into(), DEFAULT_TYPE.into());
    }
    headers.insert("x-amz-date".into(), datetime.clone());
    headers.insert("host".into(), host);

    let mut names: Vec<&String> = headers.keys().collect();
    names.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    let canonical_headers: String = names
        .iter()
        .map(|name| format!("{}:{}\n", name.to_lowercase(), headers[*name]))
        .collect();
    let mut signed: Vec<String> = headers.keys().map(|name| name.to_lowercase()).collect();
    signed.sort();
    let signed_headers = signed.join(";");

    let canonical_request = [
        verb.as_str(),
        &uri_encode(path),
        &canonical_query(input.params),
        &canonical_headers,
        &signed_headers,
        &sha256_hex(&payload),
    ]
    .join("\n");

    let date = &datetime[..8];
    let scope = format!("{date}/{}/{SERVICE}/{AWS4_REQUEST}", input.region);
    let string_to_sign = [
        AWS_SHA_256,
        &datetime,
        &scope,
        &sha256_hex(&canonical_request),
    ]
    .join("\n");

    let mut key = format!("AWS4{}", input.credential.secret_key).into_bytes();
    for part in [date, input.region, SERVICE, AWS4_REQUEST] {
        key = hmac_bytes(&key, part)?;
    }
    let signature = hex(&hmac_bytes(&key, &string_to_sign)?);

    headers.insert(
        "Authorization".into(),
        format!(
            "{AWS_SHA_256} Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
            input.credential.access_key
        ),
    );
    if let Some(token) = &input.credential.session_token
        && !token.is_empty()
    {
        headers.insert("x-amz-security-token".into(), token.clone());
    }
    headers.remove("host");
    headers
        .entry("Content-Type".into())
        .or_insert_with(|| DEFAULT_TYPE.into());
    Ok(headers)
}
