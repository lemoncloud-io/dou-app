use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub use dou_auth::Endpoints;

const DEV: (&str, &str) = ("https://api.chatic.io/dou-d1", "wss://wss.chatic.io/cht-d1");
const PROD: (&str, &str) = ("https://api.chatic.io/dou-v1", "wss://wss.chatic.io/cht-v1");

pub fn endpoints_for(stage: &str) -> Endpoints {
    let relay = option_env!("DOU_RELAY_ENDPOINT");
    let wss = option_env!("DOU_WS_ENDPOINT");
    let (default_relay, default_wss) = if stage == "prod" { PROD } else { DEV };
    Endpoints::new(relay.unwrap_or(default_relay), wss.unwrap_or(default_wss))
}

pub fn profile_dir_in(app_data: &Path) -> PathBuf {
    app_data.join("agent")
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentConfig {
    #[serde(default)]
    pub cloud: Option<String>,
}

impl AgentConfig {
    pub fn path(profile_dir: &Path) -> PathBuf {
        profile_dir.join("agent.json")
    }

    pub fn load(profile_dir: &Path) -> Self {
        std::fs::read_to_string(Self::path(profile_dir))
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, profile_dir: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(profile_dir)?;
        let text = serde_json::to_string_pretty(self).map_err(std::io::Error::other)?;
        std::fs::write(Self::path(profile_dir), text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_stage_picks_the_endpoints() {
        assert!(endpoints_for("dev").relay.ends_with("/dou-d1"));
        assert!(endpoints_for("prod").relay.ends_with("/dou-v1"));
        assert!(endpoints_for("anything else").wss.ends_with("/cht-d1"));
    }

    #[test]
    fn the_config_round_trips_and_a_missing_or_broken_file_is_empty() {
        let dir = tempfile::tempdir().expect("temp dir");
        assert_eq!(AgentConfig::load(dir.path()), AgentConfig::default());
        let config = AgentConfig {
            cloud: Some("cloud-1".into()),
        };
        config.save(dir.path()).expect("save");
        assert_eq!(AgentConfig::load(dir.path()), config);
        std::fs::write(AgentConfig::path(dir.path()), "{ not json").expect("write");
        assert_eq!(AgentConfig::load(dir.path()), AgentConfig::default());
    }

    #[test]
    fn the_profile_lives_under_the_app_data_directory() {
        assert_eq!(
            profile_dir_in(Path::new("/data/app")),
            Path::new("/data/app/agent")
        );
    }
}
