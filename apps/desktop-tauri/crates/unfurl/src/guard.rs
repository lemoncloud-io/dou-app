use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};

use url::{Host, Url};

const PRIVATE_SUFFIXES: [&str; 3] = [".localhost", ".local", ".internal"];

fn private_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    a == 0
        || a == 10
        || a == 127
        || a >= 224
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 168)
        || (a == 192 && b == 0 && c == 0)
        || (a == 198 && (18..=19).contains(&b))
        || (a == 100 && (64..=127).contains(&b))
}

fn private_v6(ip: Ipv6Addr) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return private_v4(mapped);
    }
    let s = ip.segments();
    let first = s[0];
    (first & 0xfe00) == 0xfc00
        || (first & 0xffc0) == 0xfe80
        || (first & 0xffc0) == 0xfec0
        || (first & 0xff00) == 0xff00
        || first == 0x2002
        || (first == 0x2001 && s[1] == 0)
        || (first == 0x64 && s[1] == 0xff9b && (s[2..6].iter().all(|x| *x == 0) || s[2] == 1))
        || s[..6].iter().all(|x| *x == 0)
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

pub fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => private_v4(ip),
        IpAddr::V6(ip) => private_v6(ip),
    }
}

pub fn public_only(addrs: impl IntoIterator<Item = SocketAddr>) -> Vec<SocketAddr> {
    addrs
        .into_iter()
        .filter(|addr| !is_private_ip(addr.ip()))
        .collect()
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
            "http://[64:ff9b::7f00:1]/",
            "http://[64:ff9b:1::1]/",
            "http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/",
            "http://[fec0::1]/",
            "http://[ff02::1]/",
            "http://[ff0e::1]/",
            "http://[::ffff:192.168.1.1]/",
            "http://[::ffff:169.254.169.254]/",
            "http://224.0.0.1/",
            "http://255.255.255.255/",
            "http://192.0.0.8/",
            "http://198.18.0.1/",
            "http://[2002:7f00:1::]/",
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

    #[test]
    fn a_resolved_address_list_keeps_only_public_ones() {
        let addrs = [
            "127.0.0.1:443",
            "93.184.216.34:443",
            "[::1]:443",
            "10.0.0.1:443",
        ]
        .map(|text| text.parse::<SocketAddr>().unwrap());
        assert_eq!(public_only(addrs), ["93.184.216.34:443".parse().unwrap()]);
        assert!(public_only(["169.254.169.254:80".parse::<SocketAddr>().unwrap()]).is_empty());
    }
}
