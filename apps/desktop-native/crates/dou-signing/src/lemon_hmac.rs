use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use hmac::{Hmac, Mac};
use sha2::Sha256;

use dou_core::{Error, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignaturePayload {
    pub auth_id: String,
    pub account_id: String,
    pub identity_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignatureContext {
    pub current: String,
    pub user_agent: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signature {
    pub signature: String,
    pub current: String,
}

fn hmac_base64(message: &str, key: &str) -> Result<String> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).map_err(|_| Error::InvalidKey)?;
    mac.update(message.as_bytes());
    Ok(STANDARD.encode(mac.finalize().into_bytes()))
}

pub fn sign(payload: &SignaturePayload, context: &SignatureContext) -> Result<Signature> {
    let data = [
        context.current.as_str(),
        payload.account_id.as_str(),
        payload.identity_id.as_str(),
        "",
        context.user_agent.as_str(),
    ]
    .join("&");
    let inner = hmac_base64(&data, &payload.auth_id)?;
    let middle = hmac_base64(&inner, &payload.account_id)?;
    let signature = hmac_base64(&middle, &payload.identity_id)?;
    Ok(Signature {
        signature,
        current: context.current.clone(),
    })
}
