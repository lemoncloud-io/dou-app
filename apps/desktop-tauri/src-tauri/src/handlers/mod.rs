mod notify;
mod oauth;
mod simple;
mod storage;
mod subview;
mod unfurl;
mod update;

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
    "StartUpdateDownload",
    "RestartToUpdate",
    "StorageGet",
    "StorageSave",
    "StorageClear",
    "OAuthLogin",
    "FetchUrlMetadata",
];

pub struct Context {
    pub app: AppHandle,
    pub vault: Arc<Vault>,
    pub stage: String,
}

pub fn sync(f: impl Fn(Value) -> Value + Send + Sync + 'static) -> Handler {
    Arc::new(move |message| Box::pin(ready(Ok(Some(f(message))))))
}

pub fn register_all(host: &mut BridgeHost, context: &Context) {
    simple::register(host, context);
    notify::register(host, context);
    subview::register(host, context);
    update::register(host, context);
    storage::register(host, context);
    oauth::register(host, context);
    unfurl::register(host, context);
}

pub use oauth::listen as listen_for_sign_in;
pub use update::pubkey as update_pubkey;

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
    fn handled_equals_what_the_handlers_register() {
        let sources = [
            include_str!("notify.rs"),
            include_str!("oauth.rs"),
            include_str!("simple.rs"),
            include_str!("storage.rs"),
            include_str!("subview.rs"),
            include_str!("unfurl.rs"),
            include_str!("update.rs"),
        ];
        let mut registered: Vec<String> = Vec::new();
        for source in sources {
            let production = source.split("#[cfg(test)]").next().unwrap_or(source);
            for part in production.split("host.register(").skip(1) {
                let name = part.split('"').nth(1).expect("a quoted message name");
                registered.push(name.to_string());
            }
        }
        registered.extend(["WebAppReady".to_string(), "Ping".to_string()]);
        registered.sort_unstable();
        let mut handled: Vec<String> = HANDLED.iter().map(|s| s.to_string()).collect();
        handled.sort_unstable();
        assert_eq!(registered, handled);
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
