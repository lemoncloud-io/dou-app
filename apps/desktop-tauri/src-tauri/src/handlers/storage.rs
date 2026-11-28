use std::collections::BTreeMap;
use std::sync::Arc;

use bridge_host::{BridgeHost, HandlerError};
use serde_json::{Value, json};
use vault::{Snapshot, Vault};

use super::Context;

const MEDIUM: &str = "nativeSecure";
const KEY_MAX: usize = 256;
const VALUE_MAX: usize = 64 * 1024;
const TOTAL_MAX: usize = 256 * 1024;

fn within_caps(set: &BTreeMap<String, String>, remove: &[String]) -> bool {
    let total: usize = set.iter().map(|(k, v)| k.len() + v.len()).sum();
    total <= TOTAL_MAX
        && set
            .iter()
            .all(|(k, v)| k.len() <= KEY_MAX && v.len() <= VALUE_MAX)
        && remove.iter().all(|k| k.len() <= KEY_MAX)
}

fn invalid(response_type: &str, message: &str) -> Value {
    json!({
        "type": response_type,
        "success": false,
        "error": { "code": "INVALID", "message": message },
    })
}

fn keeps_medium(message: &Value) -> bool {
    message["data"]["medium"].as_str() == Some(MEDIUM)
}

pub fn get(vault: &Vault, message: &Value) -> Value {
    if !keeps_medium(message) {
        return invalid("OnStorageGet", "Unknown storage medium");
    }
    let data = match vault.get() {
        Snapshot::Available { values, reset } => {
            let mut data = json!({ "status": "available", "values": values });
            if reset && let Some(map) = data.as_object_mut() {
                map.insert("reset".into(), Value::Bool(true));
            }
            data
        }
        Snapshot::Unavailable => {
            json!({ "status": "unavailable", "reason": "error", "values": {} })
        }
    };
    json!({ "type": "OnStorageGet", "success": true, "data": data })
}

fn string_record(value: &Value) -> Option<BTreeMap<String, String>> {
    value
        .as_object()?
        .iter()
        .map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
        .collect()
}

fn string_list(value: &Value) -> Option<Vec<String>> {
    value
        .as_array()?
        .iter()
        .map(|v| v.as_str().map(str::to_string))
        .collect()
}

pub fn save(vault: &Vault, message: &Value) -> Value {
    if !keeps_medium(message) {
        return invalid("OnStorageSave", "Unknown storage medium");
    }
    let data = &message["data"];
    let (Some(set), Some(remove)) = (string_record(&data["set"]), string_list(&data["remove"]))
    else {
        return invalid(
            "OnStorageSave",
            "set must map keys to strings and remove must list keys",
        );
    };
    if !within_caps(&set, &remove) {
        return invalid(
            "OnStorageSave",
            "A key or value is larger than the shell stores",
        );
    }
    json!({ "type": "OnStorageSave", "success": true, "data": { "ok": vault.save(&set, &remove) } })
}

pub fn clear(vault: &Vault, message: &Value) -> Value {
    if !keeps_medium(message) {
        return invalid("OnStorageClear", "Unknown storage medium");
    }
    json!({ "type": "OnStorageClear", "success": true, "data": { "ok": vault.clear() } })
}

fn blocking(vault: Arc<Vault>, work: fn(&Vault, &Value) -> Value) -> bridge_host::Handler {
    Arc::new(move |message| {
        let vault = Arc::clone(&vault);
        Box::pin(async move {
            tauri::async_runtime::spawn_blocking(move || Some(work(&vault, &message)))
                .await
                .map_err(|e| HandlerError::new("INTERNAL_ERROR", &e.to_string()))
        })
    })
}

pub fn register(host: &mut BridgeHost, context: &Context) {
    host.register("StorageGet", blocking(Arc::clone(&context.vault), get));
    host.register("StorageSave", blocking(Arc::clone(&context.vault), save));
    host.register("StorageClear", blocking(Arc::clone(&context.vault), clear));
}

#[cfg(test)]
mod tests {
    use super::*;
    use vault::KeySource;

    struct Fixed;
    impl KeySource for Fixed {
        fn key(&self) -> Result<[u8; 32], String> {
            Ok([7; 32])
        }
    }

    fn vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().expect("temp dir");
        let vault = Vault::open(dir.path().join("secrets.bin"), Box::new(Fixed));
        (dir, vault)
    }

    fn msg(data: Value) -> Value {
        json!({ "type": "x", "data": data })
    }

    #[test]
    fn save_then_get_round_trips_through_the_envelope_shapes() {
        let (_dir, vault) = vault();
        let saved = save(
            &vault,
            &msg(json!({ "medium": "nativeSecure", "set": { "a": "1" }, "remove": [] })),
        );
        assert_eq!(saved["data"]["ok"], true);
        let got = get(&vault, &msg(json!({ "medium": "nativeSecure" })));
        assert_eq!(got["type"], "OnStorageGet");
        assert_eq!(got["data"]["status"], "available");
        assert_eq!(got["data"]["values"]["a"], "1");
        assert!(got["data"].get("reset").is_none());
    }

    #[test]
    fn another_medium_is_invalid_for_all_three() {
        let (_dir, vault) = vault();
        let other = msg(json!({ "medium": "keychain", "set": {}, "remove": [] }));
        for reply in [
            get(&vault, &other),
            save(&vault, &other),
            clear(&vault, &other),
        ] {
            assert_eq!(reply["success"], false);
            assert_eq!(reply["error"]["code"], "INVALID");
        }
    }

    #[test]
    fn a_malformed_save_is_invalid_and_stores_nothing() {
        let (_dir, vault) = vault();
        for data in [
            json!({ "medium": "nativeSecure", "set": { "a": 1 }, "remove": [] }),
            json!({ "medium": "nativeSecure", "set": {}, "remove": [1] }),
            json!({ "medium": "nativeSecure", "set": [], "remove": [] }),
            json!({ "medium": "nativeSecure" }),
        ] {
            let reply = save(&vault, &msg(data));
            assert_eq!(reply["error"]["code"], "INVALID");
        }
        let got = get(&vault, &msg(json!({ "medium": "nativeSecure" })));
        assert_eq!(got["data"]["values"], json!({}));
    }

    #[test]
    fn an_oversize_key_value_or_total_is_invalid_and_stores_nothing() {
        let (_dir, vault) = vault();
        let big = "v".repeat(VALUE_MAX + 1);
        let long_key = "k".repeat(KEY_MAX + 1);
        let chunk = "c".repeat(VALUE_MAX);
        let many: serde_json::Map<String, Value> = (0..5)
            .map(|i| (format!("k{i}"), Value::String(chunk.clone())))
            .collect();
        for set in [
            json!({ "a": big }),
            json!({ long_key: "1" }),
            Value::Object(many),
        ] {
            let reply = save(
                &vault,
                &msg(json!({ "medium": "nativeSecure", "set": set, "remove": [] })),
            );
            assert_eq!(reply["error"]["code"], "INVALID");
        }
        let got = get(&vault, &msg(json!({ "medium": "nativeSecure" })));
        assert_eq!(got["data"]["values"], json!({}));
    }

    #[test]
    fn clear_empties_the_vault() {
        let (_dir, vault) = vault();
        save(
            &vault,
            &msg(json!({ "medium": "nativeSecure", "set": { "a": "1" }, "remove": [] })),
        );
        let cleared = clear(&vault, &msg(json!({ "medium": "nativeSecure" })));
        assert_eq!(cleared["data"]["ok"], true);
        let got = get(&vault, &msg(json!({ "medium": "nativeSecure" })));
        assert_eq!(got["data"]["values"], json!({}));
    }
}
