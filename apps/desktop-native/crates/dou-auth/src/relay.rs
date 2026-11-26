use dou_core::clock::iso_now;
use dou_core::{Error, Result};
use dou_http::{
    Credential as SigningCredential, HttpClient, Method, RequestSpec, Signing, build_request,
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::endpoints::Endpoints;
use crate::token::TokenView;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct PairingRequestView {
    #[serde(rename = "pairingId")]
    pub pairing_id: String,
    pub code: String,
    #[serde(rename = "expiredAt")]
    pub expired_at: i64,
    pub interval: u64,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct DelegationView {
    #[serde(rename = "delegationToken")]
    pub delegation_token: String,
    #[serde(rename = "cloudId")]
    pub cloud_id: String,
    pub backend: String,
    pub wss: String,
}

#[derive(Clone)]
pub struct RelayApi {
    http: HttpClient,
    endpoints: Endpoints,
}

pub(crate) fn signing_of(view: &TokenView) -> Signing {
    let credential = view
        .token
        .as_ref()
        .and_then(|token| token.credential.as_ref())
        .filter(|c| !c.access_key_id.is_empty() && !c.secret_key.is_empty())
        .map(|c| SigningCredential {
            access_key: c.access_key_id.clone(),
            secret_key: c.secret_key.clone(),
            session_token: c.session_token.clone(),
        });
    Signing {
        credential,
        identity_token: view.identity_token().map(str::to_string),
        region: "ap-northeast-2".to_string(),
    }
}

impl RelayApi {
    pub fn new(http: HttpClient, endpoints: Endpoints) -> Self {
        Self { http, endpoints }
    }

    pub fn endpoints(&self) -> &Endpoints {
        &self.endpoints
    }

    pub fn http(&self) -> &HttpClient {
        &self.http
    }

    async fn call(
        &self,
        method: Method,
        base_url: String,
        params: Vec<(String, Value)>,
        body: Option<Value>,
        signed_by: Option<&TokenView>,
    ) -> Result<Value> {
        let signing = signed_by.map(signing_of);
        let spec = RequestSpec {
            method,
            base_url,
            params,
            body,
        };
        let built = build_request(&spec, signing.as_ref(), &iso_now())?;
        self.http.execute(&built).await
    }

    fn parse<T: serde::de::DeserializeOwned>(value: Value) -> Result<T> {
        serde_json::from_value(value).map_err(|e| Error::InvalidResponse(e.to_string()))
    }

    pub async fn register_device(&self, device_id: &str) -> Result<TokenView> {
        let url = format!("{}/oauth/register-device", self.endpoints.relay);
        let value = self
            .call(
                Method::Post,
                url,
                vec![],
                Some(json!({ "deviceId": device_id })),
                None,
            )
            .await?;
        Self::parse(value)
    }

    pub async fn login_password(&self, uid: &str, password: &str) -> Result<TokenView> {
        let url = format!("{}/oauth/login-user", self.endpoints.relay);
        let params = vec![
            ("token".to_string(), json!(1)),
            ("email".to_string(), json!("true")),
        ];
        let value = self
            .call(
                Method::Post,
                url,
                params,
                Some(json!({ "uid": uid, "pwd": password })),
                None,
            )
            .await?;
        Self::parse(value)
    }

    pub async fn pairing_request(
        &self,
        session: &TokenView,
        device_id: &str,
        client_name: &str,
        platform: &str,
    ) -> Result<PairingRequestView> {
        let url = format!("{}/pairings/0/request", self.endpoints.relay);
        let body = json!({
            "purpose": "web",
            "deviceId": device_id,
            "client": { "name": client_name, "platform": platform },
        });
        Self::parse(
            self.call(Method::Post, url, vec![], Some(body), Some(session))
                .await?,
        )
    }

    pub async fn pairing_claim(&self, session: &TokenView, pairing_id: &str) -> Result<Value> {
        let url = format!("{}/pairings/{pairing_id}/claim", self.endpoints.relay);
        self.call(Method::Post, url, vec![], Some(json!({})), Some(session))
            .await
    }

    pub async fn pairing_check(&self, session: &TokenView, code: &str) -> Result<Value> {
        let digits: String = code.chars().filter(char::is_ascii_digit).collect();
        let url = format!("{}/pairings/0/check", self.endpoints.relay);
        self.call(
            Method::Post,
            url,
            vec![],
            Some(json!({ "code": digits })),
            Some(session),
        )
        .await
    }

    pub async fn pairing_approve(&self, session: &TokenView, pairing_id: &str) -> Result<Value> {
        let url = format!("{}/pairings/{pairing_id}/approve", self.endpoints.relay);
        let body = json!({ "target": { "type": "relay" } });
        self.call(Method::Post, url, vec![], Some(body), Some(session))
            .await
    }

    pub async fn delegate_cloud(
        &self,
        session: &TokenView,
        cloud_id: &str,
    ) -> Result<DelegationView> {
        let url = format!("{}/users/0/delegate-cloud", self.endpoints.relay);
        let params = vec![("legacy".to_string(), json!("false"))];
        let body = json!({ "target": cloud_id });
        Self::parse(
            self.call(Method::Post, url, params, Some(body), Some(session))
                .await?,
        )
    }

    pub async fn list_clouds(&self, session: &TokenView) -> Result<Value> {
        let url = format!("{}/clouds/0/list", self.endpoints.relay);
        let params = vec![("view".to_string(), json!("mine"))];
        self.call(Method::Get, url, params, None, Some(session))
            .await
    }

    pub async fn exchange_token(
        &self,
        session: &TokenView,
        delegation: &DelegationView,
    ) -> Result<TokenView> {
        let url = format!(
            "{}/oauth/exchange-token",
            delegation.backend.trim_end_matches('/')
        );
        let body = json!({ "delegationToken": delegation.delegation_token });
        Self::parse(
            self.call(Method::Post, url, vec![], Some(body), Some(session))
                .await?,
        )
    }
}
