#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoints {
    pub relay: String,
    pub wss: String,
    pub region: String,
}

impl Endpoints {
    pub fn new(relay: &str, wss: &str) -> Self {
        Self {
            relay: relay.trim_end_matches('/').to_string(),
            wss: wss.to_string(),
            region: "ap-northeast-2".to_string(),
        }
    }

    pub fn from_env_file(contents: &str) -> Option<Self> {
        let mut relay = None;
        let mut wss = None;
        for line in contents.lines() {
            let line = line.trim();
            if line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                let value = value.trim().trim_matches('"').trim_matches('\'');
                match key.trim() {
                    "VITE_DOU_ENDPOINT" => relay = Some(value.to_string()),
                    "VITE_WS_ENDPOINT" => wss = Some(value.to_string()),
                    _ => {}
                }
            }
        }
        Some(Self::new(&relay?, &wss?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_relay_and_socket_addresses_and_ignores_the_rest() {
        let env = "# c\nVITE_ENV=DEV\nVITE_DOU_ENDPOINT=https://relay.example.test/x/\nVITE_WS_ENDPOINT=\"wss://ws.example.test/y\"\nVITE_DEBUG_CODE=secret\n";
        let endpoints = Endpoints::from_env_file(env).unwrap();
        assert_eq!(endpoints.relay, "https://relay.example.test/x");
        assert_eq!(endpoints.wss, "wss://ws.example.test/y");
    }

    #[test]
    fn a_file_without_both_addresses_gives_none() {
        assert!(Endpoints::from_env_file("VITE_DOU_ENDPOINT=https://a").is_none());
    }
}
