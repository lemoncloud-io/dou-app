use std::collections::BTreeMap;

use dou_http::{Credential, Method, RequestSpec, SignInput, Signing, build_request, sign_request};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
struct File<T> {
    vectors: Vec<T>,
}

#[derive(Deserialize)]
struct CredentialJson {
    #[serde(rename = "accessKey")]
    access_key: String,
    #[serde(rename = "secretKey")]
    secret_key: String,
    #[serde(rename = "sessionToken")]
    session_token: Option<String>,
}

impl CredentialJson {
    fn into_credential(self) -> Credential {
        Credential {
            access_key: self.access_key,
            secret_key: self.secret_key,
            session_token: self.session_token,
        }
    }
}

fn params_of(value: &Option<Value>) -> Vec<(String, Value)> {
    match value {
        Some(Value::Object(map)) => map.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        _ => Vec::new(),
    }
}

fn js_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

#[derive(Deserialize)]
struct SigV4Vector {
    name: String,
    credential: CredentialJson,
    endpoint: String,
    method: String,
    params: Option<Value>,
    body: Option<Value>,
    region: String,
    now: String,
    headers: BTreeMap<String, String>,
}

#[test]
fn sigv4_vectors_match_the_ts_signer_byte_for_byte() {
    let file: File<SigV4Vector> =
        serde_json::from_str(include_str!("../../../vectors/http-sigv4.json")).unwrap();
    assert!(file.vectors.len() >= 7);
    for v in file.vectors {
        let credential = v.credential.into_credential();
        let params: Vec<(String, String)> = params_of(&v.params)
            .into_iter()
            .map(|(k, val)| (k, js_string(&val)))
            .collect();
        let headers = sign_request(&SignInput {
            credential: &credential,
            region: &v.region,
            endpoint: &v.endpoint,
            method: &v.method,
            params: &params,
            body: v.body.as_ref(),
            now: &v.now,
        })
        .unwrap();
        assert_eq!(headers, v.headers, "vector {}", v.name);
    }
}

#[derive(Deserialize)]
struct Expected {
    method: String,
    url: String,
    headers: BTreeMap<String, String>,
    data: Option<String>,
}

#[derive(Deserialize)]
struct RequestVector {
    name: String,
    signed: bool,
    method: String,
    #[serde(rename = "baseURL")]
    base_url: String,
    params: Option<Value>,
    body: Option<Value>,
    credential: Option<CredentialJson>,
    #[serde(rename = "identityToken")]
    identity_token: Option<String>,
    region: String,
    now: String,
    expected: Expected,
}

#[test]
fn request_vectors_match_the_ts_transport_byte_for_byte() {
    let file: File<RequestVector> =
        serde_json::from_str(include_str!("../../../vectors/http-requests.json")).unwrap();
    assert!(file.vectors.len() >= 7);
    for v in file.vectors {
        let method = match v.method.as_str() {
            "GET" => Method::Get,
            "POST" => Method::Post,
            other => panic!("unexpected method {other}"),
        };
        let spec = RequestSpec {
            method,
            base_url: v.base_url,
            params: params_of(&v.params),
            body: v.body,
        };
        let signing = Signing {
            credential: v.credential.map(CredentialJson::into_credential),
            identity_token: v.identity_token,
            region: v.region,
        };
        let built = build_request(&spec, v.signed.then_some(&signing), &v.now).unwrap();
        assert_eq!(built.method, v.expected.method, "{}", v.name);
        assert_eq!(built.url, v.expected.url, "{}", v.name);
        assert_eq!(built.headers, v.expected.headers, "{}", v.name);
        assert_eq!(built.body, v.expected.data, "{}", v.name);
    }
}
