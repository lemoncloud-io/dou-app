use bridge_host::BridgeHost;

pub const HANDLED: &[&str] = &["WebAppReady", "Ping"];

pub fn register_all(_host: &mut BridgeHost) {}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_host::{BRIDGE_VERSION, Config};
    use std::sync::Arc;

    #[test]
    fn the_host_registers_exactly_the_handled_list() {
        let mut host = BridgeHost::new(Config {
            version: BRIDGE_VERSION.to_string(),
            send_to_web: Arc::new(|_| {}),
            sub_webview_open_scope: None,
        });
        register_all(&mut host);
        let mut registered: Vec<&str> = host.registered().iter().map(String::as_str).collect();
        let mut handled: Vec<&str> = HANDLED.to_vec();
        registered.sort_unstable();
        handled.sort_unstable();
        assert_eq!(registered, handled);
    }
}
