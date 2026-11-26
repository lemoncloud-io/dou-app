use std::collections::BTreeMap;

use dou_core::Result;

use crate::encode::{axios_encode, js_string};
use crate::sigv4::{Credential, SignInput, sign_request};

const JSON_TYPE: &str = "application/json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
    Put,
    Patch,
    Delete,
}

impl Method {
    pub fn as_str(self) -> &'static str {
        match self {
            Method::Get => "get",
            Method::Post => "post",
            Method::Put => "put",
            Method::Patch => "patch",
            Method::Delete => "delete",
        }
    }
}

#[derive(Debug, Clone)]
pub struct RequestSpec {
    pub method: Method,
    pub base_url: String,
    pub params: Vec<(String, serde_json::Value)>,
    pub body: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct Signing {
    pub credential: Option<Credential>,
    pub identity_token: Option<String>,
    pub region: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuiltRequest {
    pub method: &'static str,
    pub url: String,
    pub headers: BTreeMap<String, String>,
    pub body: Option<String>,
}

fn serialize_params(params: &[(String, serde_json::Value)]) -> String {
    params
        .iter()
        .filter(|(_, value)| !value.is_null())
        .map(|(key, value)| format!("{}={}", axios_encode(key), axios_encode(&js_string(value))))
        .collect::<Vec<_>>()
        .join("&")
}

pub fn build_request(
    spec: &RequestSpec,
    signing: Option<&Signing>,
    now: &str,
) -> Result<BuiltRequest> {
    let query = serialize_params(&spec.params);
    let url = if query.is_empty() {
        spec.base_url.clone()
    } else {
        let joiner = if spec.base_url.contains('?') {
            '&'
        } else {
            '?'
        };
        format!("{}{joiner}{query}", spec.base_url)
    };

    let mut headers: BTreeMap<String, String> = BTreeMap::new();

    if let Some(signing) = signing
        && let Some(credential) = &signing.credential
    {
        let string_params: Vec<(String, String)> = spec
            .params
            .iter()
            .map(|(key, value)| (key.clone(), js_string(value)))
            .collect();
        headers = sign_request(&SignInput {
            credential,
            region: &signing.region,
            endpoint: &spec.base_url,
            method: spec.method.as_str(),
            params: &string_params,
            body: spec.body.as_ref(),
            now,
        })?;
        if let Some(identity) = signing.identity_token.as_deref().filter(|t| !t.is_empty()) {
            headers.insert("x-lemon-identity".into(), identity.to_string());
        }
    }
    headers.insert("Content-Type".into(), JSON_TYPE.into());
    headers
        .entry("Accept".into())
        .or_insert_with(|| "application/json, text/plain, */*".into());

    Ok(BuiltRequest {
        method: spec.method.as_str(),
        url,
        headers,
        body: spec.body.as_ref().map(|body| match body {
            serde_json::Value::String(text) => text.clone(),
            other => other.to_string(),
        }),
    })
}
