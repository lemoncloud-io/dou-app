use std::path::Path;

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

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        let text = serde_json::to_string_pretty(self).map_err(std::io::Error::other)?;
        let staged = path.with_extension("json.tmp");
        std::fs::write(&staged, text)?;
        std::fs::rename(&staged, path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_or_broken_file_means_off() {
        let dir = tempfile::tempdir().expect("temp dir");
        assert_eq!(
            Settings::load(&dir.path().join("none.json")).tier,
            Tier::Off
        );
        let broken = dir.path().join("broken.json");
        std::fs::write(&broken, "{ not json").expect("write");
        assert_eq!(Settings::load(&broken), Settings::default());
    }

    #[test]
    fn a_saved_file_reads_back_and_an_unknown_tier_fails_closed() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("settings.json");
        let settings = Settings {
            tier: Tier::Write,
            allow_rooms: vec!["r1".into()],
            rate_limit: RateLimit::default(),
        };
        settings.save(&path).expect("save");
        assert_eq!(Settings::load(&path), settings);
        std::fs::write(&path, r#"{"tier":"root"}"#).expect("write");
        assert_eq!(Settings::load(&path).tier, Tier::Off);
    }
}
