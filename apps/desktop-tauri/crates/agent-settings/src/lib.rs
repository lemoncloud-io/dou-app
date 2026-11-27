use std::path::Path;

mod model;

pub use model::{RateLimit, Settings, Tier};
use serde_json::{Value, json};

const MAX_ROOMS: usize = 500;
const MAX_ROOM_ID_LEN: usize = 200;
const MAX_PER_MINUTE: u64 = 600;
const MAX_PER_HOUR: u64 = 10_000;

pub fn to_value(settings: &Settings) -> Value {
    json!({
        "tier": settings.tier,
        "allowRooms": settings.allow_rooms,
        "rateLimit": { "perMinute": settings.rate_limit.per_minute, "perHour": settings.rate_limit.per_hour },
    })
}

pub fn parse(input: &Value) -> Result<Settings, String> {
    let tier = input["tier"]
        .as_str()
        .and_then(Tier::parse)
        .ok_or("tier must be off, read, write or full")?;

    let rooms = input["allowRooms"]
        .as_array()
        .ok_or("allowRooms must be a list")?;
    if rooms.len() > MAX_ROOMS {
        return Err(format!("at most {MAX_ROOMS} rooms may be allowed"));
    }
    let mut allow_rooms: Vec<String> = Vec::new();
    for room in rooms {
        let id = room
            .as_str()
            .filter(|id| !id.is_empty() && id.len() <= MAX_ROOM_ID_LEN)
            .ok_or("every allowed room must be a non-empty id")?;
        if !allow_rooms.iter().any(|known| known == id) {
            allow_rooms.push(id.to_string());
        }
    }

    let per_minute = input["rateLimit"]["perMinute"]
        .as_u64()
        .filter(|n| (1..=MAX_PER_MINUTE).contains(n))
        .ok_or("perMinute must be between 1 and 600")?;
    let per_hour = input["rateLimit"]["perHour"]
        .as_u64()
        .filter(|n| (1..=MAX_PER_HOUR).contains(n))
        .ok_or("perHour must be between 1 and 10000")?;
    if per_hour < per_minute {
        return Err("perHour must not be below perMinute".to_string());
    }

    Ok(Settings {
        tier,
        allow_rooms,
        rate_limit: RateLimit {
            per_minute: per_minute as u32,
            per_hour: per_hour as u32,
        },
    })
}

pub fn load(path: &Path) -> Settings {
    Settings::load(path)
}

pub fn save(path: &Path, input: &Value) -> Result<Settings, String> {
    let settings = parse(input)?;
    settings.save(path).map_err(|e| e.to_string())?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(tier: &str, rooms: Value, per_minute: u64, per_hour: u64) -> Value {
        json!({ "tier": tier, "allowRooms": rooms, "rateLimit": { "perMinute": per_minute, "perHour": per_hour } })
    }

    #[test]
    fn a_missing_file_gives_tier_off_no_rooms_and_the_default_limit() {
        let dir = tempfile::tempdir().expect("temp dir");
        let settings = load(&dir.path().join("settings.json"));
        assert_eq!(settings.tier, Tier::Off);
        assert!(settings.allow_rooms.is_empty());
        assert_eq!(settings.rate_limit, RateLimit::default());
    }

    #[test]
    fn a_valid_input_is_saved_and_read_back() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("settings.json");
        let saved = save(&path, &input("write", json!(["r1", "r2", "r1"]), 5, 50)).expect("save");
        assert_eq!(saved.tier, Tier::Write);
        assert_eq!(saved.allow_rooms, vec!["r1", "r2"]);
        assert_eq!(load(&path), saved);
        assert_eq!(to_value(&saved)["rateLimit"]["perHour"], 50);
    }

    #[test]
    fn invalid_inputs_are_refused_and_write_nothing() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("settings.json");
        let bad = [
            input("admin", json!([]), 5, 50),
            input("read", json!([""]), 5, 50),
            input("read", json!([1]), 5, 50),
            input("read", json!([]), 0, 50),
            input("read", json!([]), 5, 0),
            input("read", json!([]), 601, 10_000),
            input("read", json!([]), 60, 10),
            json!({ "tier": "read" }),
        ];
        for value in bad {
            assert!(save(&path, &value).is_err(), "{value}");
        }
        assert!(!path.exists());
    }

    #[test]
    fn too_many_rooms_are_refused() {
        let rooms: Vec<String> = (0..501).map(|n| format!("room-{n}")).collect();
        assert!(parse(&input("read", json!(rooms), 5, 50)).is_err());
    }
}