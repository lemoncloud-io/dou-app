use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Credential {
    #[serde(rename = "AccessKeyId")]
    pub access_key_id: String,
    #[serde(rename = "SecretKey")]
    pub secret_key: String,
    #[serde(
        rename = "SessionToken",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub session_token: Option<String>,
    #[serde(
        rename = "Expiration",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub expiration: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct Token {
    #[serde(rename = "authId", default, skip_serializing_if = "Option::is_none")]
    pub auth_id: Option<String>,
    #[serde(rename = "accountId", default, skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(
        rename = "identityId",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub identity_id: Option<String>,
    #[serde(
        rename = "identityToken",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub identity_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credential: Option<Credential>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct AuthModel {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "accountId", default, skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct TokenView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uid: Option<String>,
    #[serde(rename = "$auth", default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<AuthModel>,
    #[serde(rename = "Token", default, skip_serializing_if = "Option::is_none")]
    pub token: Option<Token>,
    #[serde(rename = "cloudId", default, skip_serializing_if = "Option::is_none")]
    pub cloud_id: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl TokenView {
    pub fn user_id(&self) -> Option<&str> {
        self.uid.as_deref().or(self.id.as_deref())
    }

    pub fn identity_token(&self) -> Option<&str> {
        self.token.as_ref()?.identity_token.as_deref()
    }

    pub fn relay_auth_id(&self) -> Option<&str> {
        self.auth.as_ref()?.id.as_deref()
    }

    pub fn cloud_auth_id(&self) -> Option<&str> {
        self.token.as_ref()?.auth_id.as_deref()
    }

    pub fn account_id(&self) -> Option<&str> {
        self.auth
            .as_ref()
            .and_then(|a| a.account_id.as_deref())
            .or_else(|| self.token.as_ref()?.account_id.as_deref())
    }

    pub fn identity_id(&self) -> Option<&str> {
        self.token.as_ref()?.identity_id.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_unknown_fields_through_a_round_trip() {
        let json = r#"{"id":"u1","$auth":{"id":"a1","accountId":"acc","refreshedAt":5},"Token":{"authId":"t","accountId":"acc2","identityId":"i","identityToken":"jwt","credential":{"AccessKeyId":"k","SecretKey":"s","SessionToken":"x","Expiration":"2026"},"identityPoolId":"p"},"expiresIn":3600}"#;
        let view: TokenView = serde_json::from_str(json).unwrap();
        assert_eq!(view.relay_auth_id(), Some("a1"));
        assert_eq!(view.account_id(), Some("acc"));
        assert_eq!(view.identity_id(), Some("i"));
        let again: serde_json::Value = serde_json::to_value(&view).unwrap();
        assert_eq!(
            again,
            serde_json::from_str::<serde_json::Value>(json).unwrap()
        );
    }
}
