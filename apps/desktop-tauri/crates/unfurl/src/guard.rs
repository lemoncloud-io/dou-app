use std::net::{Ipv4Addr, Ipv6Addr};

use url::{Host, Url};

const PRIVATE_SUFFIXES: [&str; 3] = [".localhost", ".local", ".internal"];

fn private_v4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    a == 0
        || a == 10
        || a == 127
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 168)
        || (a == 100 && (64..=127).contains(&b))
}

fn private_v6(ip: Ipv6Addr) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return private_v4(mapped);
    }
    let first = ip.segments()[0];
    (first & 0xfe00) == 0xfc00
        || (first & 0xffc0) == 0xfe80
        || ip.segments()[..6].iter().all(|segment| *segment == 0)
}

fn private_name(name: &str) -> bool {
    let host = name.to_ascii_lowercase();
    let host = host.trim_end_matches('.');
    host == "localhost"
        || PRIVATE_SUFFIXES.iter().any(|suffix| host.ends_with(suffix))
        || !host.contains('.')
}

pub fn is_private_host(host: &Host<&str>) -> bool {
    match host {
        Host::Ipv4(ip) => private_v4(*ip),
        Host::Ipv6(ip) => private_v6(*ip),
        Host::Domain(name) => private_name(name),
    }
}

pub fn is_fetchable(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && url.host().is_some_and(|host| !is_private_host(&host))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fetchable(url: &str) -> bool {
        is_fetchable(&Url::parse(url).unwrap())
    }

    #[test]
    fn public_hosts_pass() {
        for url in [
            "https://example.com/a",
            "http://example.com:8080/",
            "https://93.184.216.34/",
            "https://172.15.0.1/",
            "https://172.32.0.1/",
            "https://100.63.0.1/",
            "https://[2606:4700::1111]/",
            "https://sub.dou.chatic.io./",
        ] {
            assert!(fetchable(url), "{url}");
        }
    }

    #[test]
    fn private_loopback_and_link_local_hosts_are_refused() {
        for url in [
            "http://localhost/",
            "http://LOCALHOST./",
            "http://app.localhost/",
            "http://printer.local/",
            "http://db.internal/",
            "http://intranet/",
            "http://0.0.0.0/",
            "http://10.1.2.3/",
            "http://127.0.0.1/",
            "http://127.1/",
            "http://2130706433/",
            "http://169.254.169.254/",
            "http://172.16.0.1/",
            "http://172.31.255.255/",
            "http://192.168.0.1/",
            "http://100.64.0.1/",
            "http://[::]/",
            "http://[::1]/",
            "http://[fc00::1]/",
            "http://[fd12::1]/",
            "http://[fe80::1]/",
            "http://[::ffff:127.0.0.1]/",
            "http://[::ffff:10.0.0.1]/",
            "http://[::7f00:1]/",
        ] {
            assert!(!fetchable(url), "{url}");
        }
    }

    #[test]
    fn only_http_and_https_are_fetched() {
        for url in [
            "ftp://example.com/",
            "file:///etc/passwd",
            "data:text/html,x",
            "chatic://oauth",
        ] {
            assert!(!fetchable(url), "{url}");
        }
    }
}
