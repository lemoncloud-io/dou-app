mod classify;
mod client;
mod encode;
mod request;
mod sigv4;

pub use classify::{Classification, ErrorClass, Failure, classify};
pub use client::HttpClient;
pub use request::{BuiltRequest, Method, RequestSpec, Signing, build_request};
pub use sigv4::{Credential, SignInput, sign_request};
