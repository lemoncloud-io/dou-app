use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error, PartialEq, Eq, Clone)]
pub enum Error {
    #[error("missing field: {0}")]
    MissingField(&'static str),
    #[error("invalid signing key")]
    InvalidKey,
    #[error("http {status}: {message}")]
    Http { status: u16, message: String },
    #[error("network: {0}")]
    Network(String),
    #[error("invalid response: {0}")]
    InvalidResponse(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_field_names_the_field() {
        assert_eq!(
            Error::MissingField("authId").to_string(),
            "missing field: authId"
        );
    }
}
