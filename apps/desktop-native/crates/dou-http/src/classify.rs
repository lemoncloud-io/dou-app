#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorClass {
    Authentication,
    Network,
    Server,
    Client,
    Unknown,
}

#[derive(Debug, Clone, Default)]
pub struct Failure {
    pub status: Option<u16>,
    pub message: String,
    pub network: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Classification {
    pub class: ErrorClass,
    pub should_retry: bool,
    pub should_logout: bool,
}

pub fn classify(failure: &Failure) -> Classification {
    let message = failure.message.as_str();
    let status = failure.status.unwrap_or(0);
    let auth = |logout: bool| Classification {
        class: ErrorClass::Authentication,
        should_retry: false,
        should_logout: logout,
    };

    if message.contains("INVALID_TOKEN") || message.contains("Token validation failed") {
        return auth(true);
    }
    if message.contains("signature timeout") || (status == 400 && message.contains("TIMEOUT")) {
        return auth(true);
    }
    if status == 403 {
        return auth(true);
    }
    let lowered = message.to_lowercase();
    if lowered.contains("no auth model")
        || (lowered.contains("signature")
            && (lowered.contains("invalid")
                || lowered.contains("mismatch")
                || lowered.contains("not valid")))
    {
        return auth(false);
    }
    if status < 400
        && (failure.network || message.starts_with("TIMEOUT:") || message.contains("Network Error"))
    {
        return Classification {
            class: ErrorClass::Network,
            should_retry: true,
            should_logout: false,
        };
    }
    if (500..600).contains(&status) {
        return Classification {
            class: ErrorClass::Server,
            should_retry: true,
            should_logout: false,
        };
    }
    if (400..500).contains(&status) {
        return Classification {
            class: ErrorClass::Client,
            should_retry: false,
            should_logout: false,
        };
    }
    Classification {
        class: ErrorClass::Unknown,
        should_retry: true,
        should_logout: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn failure(status: Option<u16>, message: &str) -> Failure {
        Failure {
            status,
            message: message.into(),
            network: false,
        }
    }

    #[test]
    fn a_403_logs_out_and_never_retries() {
        let c = classify(&failure(Some(403), "NOT ALLOWED"));
        assert_eq!((c.should_retry, c.should_logout), (false, true));
    }

    #[test]
    fn a_5xx_retries() {
        assert!(classify(&failure(Some(503), "")).should_retry);
    }

    #[test]
    fn a_4xx_does_not_retry_and_keeps_the_session() {
        let c = classify(&failure(Some(404), "not found"));
        assert_eq!(
            (c.class, c.should_retry, c.should_logout),
            (ErrorClass::Client, false, false)
        );
    }

    #[test]
    fn a_dropped_connection_retries() {
        let c = classify(&Failure {
            network: true,
            ..Failure::default()
        });
        assert_eq!(c.class, ErrorClass::Network);
        assert!(c.should_retry);
    }

    #[test]
    fn an_invalid_signature_message_is_an_auth_failure_without_logout() {
        let c = classify(&failure(None, "invalid sign: signature mismatch"));
        assert_eq!(
            (c.class, c.should_logout),
            (ErrorClass::Authentication, false)
        );
    }
}
