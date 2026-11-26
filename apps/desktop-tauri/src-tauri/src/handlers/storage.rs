use std::collections::BTreeMap;
use std::sync::Arc;

use bridge_host::BridgeHost;
use serde_json::{Value, json};
use vault::{Snapshot, Vault};

use super::{Context, sync};

const MEDIUM: &str = "nativeSecure";

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
    json!({ "type": "OnStorageSave", "success": true, "data": { "ok": vault.save(&set, &remove) } })
}

pub fn clear(vault: &Vault, message: &Value) -> Value {
    if !keeps_medium(message) {
        return invalid("OnStorageClear", "Unknown storage medium");
    }
    json!({ "type": "OnStorageClear", "success": true, "data": { "ok": vault.clear() } })
}

pub fn register(host: &mut BridgeHost, context: &Context) {
    let vault = Arc::clone(&context.vault);
    host.register(
        "StorageGet",
        sync({
            let vault = Arc::clone(&vault);
            move |message| get(&vault, &message)
        }),
    );
    host.register(
        "StorageSave",
        sync({
            let vault = Arc::clone(&vault);
            move |message| save(&vault, &message)
        }),
    );
    host.register("StorageClear", sync(move |message| clear(&vault, &message)));
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
