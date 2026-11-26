use std::path::Path;

use dou_core::{Error, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    #[default]
    Off,
    Read,
    Write,
    Full,
}

impl Tier {
    pub fn parse(text: &str) -> Option<Self> {
        match text {
            "off" => Some(Tier::Off),
            "read" => Some(Tier::Read),
            "write" => Some(Tier::Write),
            "full" => Some(Tier::Full),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RateLimit {
    #[serde(rename = "perMinute")]
    pub per_minute: u32,
    #[serde(rename = "perHour")]
    pub per_hour: u32,
}

impl Default for RateLimit {
    fn default() -> Self {
        Self {
            per_minute: 10,
            per_hour: 100,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct Settings {
    #[serde(default)]
    pub tier: Tier,
    #[serde(default, rename = "allowRooms")]
    pub allow_rooms: Vec<String>,
    #[serde(default, rename = "rateLimit")]
    pub rate_limit: RateLimit,
}

impl Settings {
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        let text = serde_json::to_string_pretty(self).map_err(|e| Error::Storage(e.to_string()))?;
        std::fs::write(path, text).map_err(|e| Error::Storage(e.to_string()))
    }

    pub fn allows_room(&self, channel_id: &str) -> bool {
        self.allow_rooms.iter().any(|room| room == channel_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("dou-settings-{name}-{}.json", std::process::id()))
    }

    #[test]
    fn a_missing_or_broken_file_means_off() {
        assert_eq!(Settings::load(&scratch("missing")).tier, Tier::Off);
        let broken = scratch("broken");
        std::fs::write(&broken, "{ not json").unwrap();
        assert_eq!(Settings::load(&broken), Settings::default());
    }

    #[test]
    fn a_saved_file_reads_back_and_an_unknown_tier_fails_closed() {
        let path = scratch("roundtrip");
        let settings = Settings {
            tier: Tier::Write,
            allow_rooms: vec!["r1".into()],
            rate_limit: RateLimit::default(),
        };
        settings.save(&path).unwrap();
        assert_eq!(Settings::load(&path), settings);
        std::fs::write(&path, r#"{"tier":"root"}"#).unwrap();
        assert_eq!(Settings::load(&path).tier, Tier::Off);
    }
}
