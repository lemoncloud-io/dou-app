use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum Error {
    #[error("missing field: {0}")]
    MissingField(&'static str),
    #[error("invalid signing key")]
    InvalidKey,
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
