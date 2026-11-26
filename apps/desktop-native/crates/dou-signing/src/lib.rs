mod lemon_hmac;

pub use dou_core::{Error, Result};
pub use lemon_hmac::{Signature, SignatureContext, SignaturePayload, sign};
