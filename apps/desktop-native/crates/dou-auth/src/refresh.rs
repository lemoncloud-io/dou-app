use dou_core::clock::iso_now;
use dou_core::{Error, Result};
use dou_signing::{SignatureContext, SignaturePayload, sign};
use dou_socket::open_session;
use serde_json::json;

use crate::endpoints::Endpoints;
use crate::token::TokenView;

pub fn merge_refreshed_relay(stored: &TokenView, fresh: TokenView) -> TokenView {
    let mut merged = stored.clone();
    merged.extra.extend(fresh.extra);
    if fresh.id.is_some() {
        merged.id = fresh.id;
    }
    if fresh.uid.is_some() {
        merged.uid = fresh.uid;
    }
    if let Some(fresh_token) = fresh.token {
        let mut token = merged.token.take().unwrap_or_default();
        token.extra.extend(fresh_token.extra);
        token.auth_id = fresh_token.auth_id.or(token.auth_id);
        token.account_id = fresh_token.account_id.or(token.account_id);
        token.identity_id = fresh_token.identity_id.or(token.identity_id);
        token.identity_token = fresh_token.identity_token.or(token.identity_token);
        token.credential = fresh_token.credential.or(token.credential);
        merged.token = Some(token);
    }
    merged
}

pub fn relay_signature_payload(view: &TokenView) -> Result<SignaturePayload> {
    let field = |value: Option<&str>, name: &'static str| {
        value.map(str::to_string).ok_or(Error::MissingField(name))
    };
    Ok(SignaturePayload {
        auth_id: field(view.relay_auth_id(), "$auth.id")?,
        account_id: field(view.account_id(), "accountId")?,
        identity_id: field(view.identity_id(), "identityId")?,
    })
}

pub async fn refresh_relay(
    endpoints: &Endpoints,
    user_agent: &str,
    device_id: &str,
    stored: &TokenView,
) -> Result<TokenView> {
    let identity = stored
        .identity_token()
        .ok_or(Error::MissingField("identityToken"))?;
    let payload = relay_signature_payload(stored)?;
    let open = open_session(
        &endpoints.wss,
        user_agent,
        identity,
        device_id,
        "DoU Desktop (native)",
    )
    .await?;
    let current = iso_now();
    let signed = sign(
        &payload,
        &SignatureContext {
            current: current.clone(),
            user_agent: user_agent.to_string(),
        },
    )?;
    let body = json!({ "current": signed.current, "signature": signed.signature, "authId": payload.auth_id });
    let answer = open
        .socket
        .request("auth.refresh", Some(&body), None)
        .await?;
    let fresh: TokenView =
        serde_json::from_value(answer).map_err(|e| Error::InvalidResponse(e.to_string()))?;
    Ok(merge_refreshed_relay(stored, fresh))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn view(json: &str) -> TokenView {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn a_refresh_keeps_the_stored_auth_model_and_takes_the_new_credential() {
        let stored = view(
            r#"{"id":"u","$auth":{"id":"a1","accountId":"acc"},"Token":{"identityToken":"old","identityId":"i","credential":{"AccessKeyId":"k1","SecretKey":"s1"}}}"#,
        );
        let fresh = view(
            r#"{"$auth":{"id":"CHILD"},"Token":{"credential":{"AccessKeyId":"k2","SecretKey":"s2"}}}"#,
        );
        let merged = merge_refreshed_relay(&stored, fresh);
        assert_eq!(merged.relay_auth_id(), Some("a1"));
        assert_eq!(merged.identity_token(), Some("old"));
        assert_eq!(
            merged.token.unwrap().credential.unwrap().access_key_id,
            "k2"
        );
    }

    #[test]
    fn the_relay_signature_takes_the_auth_models_id_not_the_http_auth_id() {
        let stored = view(
            r#"{"$auth":{"id":"auth-model","accountId":"acc"},"Token":{"authId":"http-auth","accountId":"other","identityId":"i"}}"#,
        );
        let payload = relay_signature_payload(&stored).unwrap();
        assert_eq!(payload.auth_id, "auth-model");
        assert_eq!(payload.account_id, "acc");
        assert_eq!(payload.identity_id, "i");
    }

    #[test]
    fn a_session_without_an_auth_model_cannot_be_refreshed() {
        let stored = view(r#"{"Token":{"identityId":"i","accountId":"a"}}"#);
        assert_eq!(
            relay_signature_payload(&stored).unwrap_err(),
            Error::MissingField("$auth.id")
        );
    }
}
