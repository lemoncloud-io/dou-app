mod notify;
mod simple;
mod storage;
mod subview;

use std::future::ready;
use std::sync::Arc;

use bridge_host::{BridgeHost, Handler};
use serde_json::Value;
use tauri::AppHandle;
use vault::Vault;

pub const HANDLED: &[&str] = &[
    "WebAppReady",
    "Ping",
    "SavePreference",
    "FetchFcmToken",
    "SetBadgeCount",
    "OpenURL",
    "ShowNotification",
    "OpenSubWebView",
    "CloseSubWebView",
    "StorageGet",
    "StorageSave",
    "StorageClear",
];

pub struct Context {
    pub app: AppHandle,
    pub vault: Arc<Vault>,
}

pub fn sync(f: impl Fn(Value) -> Value + Send + Sync + 'static) -> Handler {
    Arc::new(move |message| Box::pin(ready(Ok(Some(f(message))))))
}

pub fn register_all(host: &mut BridgeHost, context: &Context) {
    simple::register(host, context);
    notify::register(host, context);
    subview::register(host, context);
    storage::register(host, context);
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_host::{BRIDGE_VERSION, Config};

    #[test]
    fn handled_has_no_duplicates() {
        let mut names = HANDLED.to_vec();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), HANDLED.len());
    }

    #[test]
    fn a_fresh_host_knows_only_the_built_ins() {
        let host = BridgeHost::new(Config {
            version: BRIDGE_VERSION.to_string(),
            send_to_web: Arc::new(|_| {}),
            sub_webview_open_scope: None,
        });
        assert_eq!(host.registered(), ["WebAppReady", "Ping"]);
    }
}
