use serde_json::Value;

use crate::{TITLE_LIMIT, Trust, local_origin_of, origin_of};

const HAND_OFF_LIMIT: usize = 3;
const HAND_OFF_WINDOW_MS: u64 = 10_000;
const FRAME_SCHEMES: [&str; 4] = ["https", "about", "data", "blob"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Navigation {
    Load,
    External,
    Block,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Display {
    Titled,
    Clean,
}

fn ambiguous(url: &str) -> bool {
    if url
        .chars()
        .any(|c| c == '\\' || c.is_whitespace() || c.is_control())
    {
        return true;
    }
    for scheme in ["https://", "http://"] {
        if url
            .get(..scheme.len())
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case(scheme))
        {
            let rest = &url[scheme.len()..];
            let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
            return rest[..end].contains('@');
        }
    }
    false
}

fn is_deep_link(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let Some(rest) = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"))
    else {
        return false;
    };
    let Some((authority, path)) = rest.split_once('/') else {
        return false;
    };
    let host = match authority.split_once(':') {
        Some((host, port)) if port.chars().all(|c| c.is_ascii_digit()) => host,
        Some(_) => return false,
        None => authority,
    };
    let host = host.strip_suffix('.').unwrap_or(host);
    if host != "app.chatic.io" && host != "app-dev.chatic.io" {
        return false;
    }
    let Some(after) = path.strip_prefix('i').or_else(|| path.strip_prefix('s')) else {
        return false;
    };
    after.is_empty() || after.starts_with(['/', '?', '#'])
}

pub fn opened_origin_of(url: &str) -> Option<String> {
    origin_of(url).or_else(|| local_origin_of(url))
}

pub fn decide_navigation(url: &str, opened_origin: &str) -> Navigation {
    if url == "about:blank" {
        return Navigation::Load;
    }
    if ambiguous(url) {
        return Navigation::Block;
    }
    if opened_origin_of(url).as_deref() == Some(opened_origin) {
        return Navigation::Load;
    }
    if is_deep_link(url) {
        return Navigation::Block;
    }
    if origin_of(url).is_some() {
        Navigation::External
    } else {
        Navigation::Block
    }
}

pub fn allows_frame(url: &str, opened_origin: &str) -> bool {
    let scheme = url
        .split_once(':')
        .map(|(scheme, _)| scheme.to_ascii_lowercase());
    if let Some(scheme) = scheme
        && scheme.starts_with(|c: char| c.is_ascii_alphabetic())
        && scheme
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
        && FRAME_SCHEMES.contains(&scheme.as_str())
    {
        return true;
    }
    opened_origin_of(url).as_deref() == Some(opened_origin)
}

pub fn accepts_message(sender_url: Option<&str>, is_main_frame: bool, opened_origin: &str) -> bool {
    is_main_frame
        && sender_url.is_some_and(|url| opened_origin_of(url).as_deref() == Some(opened_origin))
}

#[derive(Default)]
pub struct HandOffs(Vec<u64>);

impl HandOffs {
    pub fn allow(&mut self, now_ms: u64) -> bool {
        self.0
            .retain(|at| now_ms.saturating_sub(*at) < HAND_OFF_WINDOW_MS);
        if self.0.len() >= HAND_OFF_LIMIT {
            return false;
        }
        self.0.push(now_ms);
        true
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Manifest {
    pub name: Option<String>,
    pub display: Option<Display>,
}

fn display_named(value: &Value) -> Option<Display> {
    match value.as_str()? {
        "titled" | "standard" => Some(Display::Titled),
        "clean" | "immersive" | "fullscreen" => Some(Display::Clean),
        _ => None,
    }
}

pub fn read_manifest(json: &Value) -> Manifest {
    if json["manifestVersion"] != 1 {
        return Manifest::default();
    }
    let name = json["name"]
        .as_str()
        .filter(|name| !name.trim().is_empty() && name.chars().count() <= TITLE_LIMIT)
        .map(|name| name.trim().to_string());
    Manifest {
        name,
        display: display_named(&json["display"]),
    }
}

pub fn fetches_manifest(trust: Trust) -> bool {
    trust != Trust::External
}

pub fn display_of(trust: Trust, manifest: &Manifest) -> Display {
    if trust == Trust::External {
        Display::Titled
    } else {
        manifest.display.unwrap_or(Display::Titled)
    }
}

#[derive(Debug, Default, Clone)]
pub struct Titles {
    pub requested: Option<String>,
    pub document: Option<String>,
    pub manifest_name: Option<String>,
}

fn host_of_origin(origin: &str) -> &str {
    origin
        .strip_prefix("https://")
        .or_else(|| origin.strip_prefix("http://"))
        .unwrap_or(origin)
}

pub fn bar_title_of(
    origin: &str,
    trust: Trust,
    opened_title: Option<&str>,
    shown: &Titles,
) -> String {
    let host = host_of_origin(origin);
    if trust == Trust::External {
        return host.to_string();
    }
    [
        shown.requested.as_deref(),
        shown.document.as_deref(),
        opened_title,
        shown.manifest_name.as_deref(),
    ]
    .into_iter()
    .flatten()
    .find(|title| !title.trim().is_empty())
    .map_or_else(
        || host.to_string(),
        |title| title.trim().chars().take(TITLE_LIMIT).collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const ORIGIN: &str = "https://calc.apps.chatic.io";

    #[test]
    fn same_origin_loads_other_https_goes_out_and_the_rest_is_blocked() {
        let decide = |url: &str| decide_navigation(url, ORIGIN);
        assert_eq!(decide("about:blank"), Navigation::Load);
        assert_eq!(
            decide("https://calc.apps.chatic.io/next?x=1"),
            Navigation::Load
        );
        assert_eq!(decide("https://other.example.com/"), Navigation::External);
        assert_eq!(decide("http://other.example.com/"), Navigation::Block);
        assert_eq!(decide("file:///etc/passwd"), Navigation::Block);
        assert_eq!(decide("javascript:alert(1)"), Navigation::Block);
        assert_eq!(decide("chatic://x"), Navigation::Block);
    }

    #[test]
    fn userinfo_backslashes_and_control_characters_are_blocked() {
        let decide = |url: &str| decide_navigation(url, ORIGIN);
        assert_eq!(
            decide("https://calc.apps.chatic.io@evil.example/"),
            Navigation::Block
        );
        assert_eq!(
            decide("https://calc.apps.chatic.io\\@evil.example/"),
            Navigation::Block
        );
        assert_eq!(decide("https://calc.apps.chatic.io/a b"), Navigation::Block);
        assert_eq!(decide("https://calc.apps.chatic.io/\n"), Navigation::Block);
    }

    #[test]
    fn app_deep_links_are_blocked_not_opened_in_the_browser() {
        let decide = |url: &str| decide_navigation(url, ORIGIN);
        for url in [
            "https://app.chatic.io/i/abc",
            "https://app-dev.chatic.io/s",
            "https://APP.chatic.io./i?x=1",
            "http://app.chatic.io:80/s#f",
        ] {
            assert_eq!(decide(url), Navigation::Block, "{url}");
        }
        assert_eq!(decide("https://app.chatic.io/inbox"), Navigation::External);
        assert_eq!(decide("https://app.chatic.io/"), Navigation::External);
    }

    #[test]
    fn a_local_dev_origin_loads_itself_and_hands_out_https() {
        let local = "http://localhost:5100";
        assert_eq!(
            decide_navigation("http://localhost:5100/a", local),
            Navigation::Load
        );
        assert_eq!(
            decide_navigation("http://localhost:5101/a", local),
            Navigation::Block
        );
        assert_eq!(
            decide_navigation("https://example.com", local),
            Navigation::External
        );
        assert!(allows_frame("http://localhost:5100/x", local));
        assert!(!allows_frame("http://localhost:5101/x", local));
    }

    #[test]
    fn frames_may_use_only_four_schemes_or_the_opened_origin() {
        for url in [
            "https://x.example.com",
            "about:blank",
            "data:text/html,a",
            "blob:https://x/1",
        ] {
            assert!(allows_frame(url, ORIGIN), "{url}");
        }
        for url in [
            "http://x.example.com",
            "file:///x",
            "javascript:1",
            "no-scheme",
        ] {
            assert!(!allows_frame(url, ORIGIN), "{url}");
        }
    }

    #[test]
    fn a_message_counts_only_from_the_main_frame_on_the_opened_origin() {
        assert!(accepts_message(
            Some("https://calc.apps.chatic.io/a"),
            true,
            ORIGIN
        ));
        assert!(!accepts_message(
            Some("https://calc.apps.chatic.io/a"),
            false,
            ORIGIN
        ));
        assert!(!accepts_message(
            Some("https://evil.example.com"),
            true,
            ORIGIN
        ));
        assert!(!accepts_message(None, true, ORIGIN));
    }

    #[test]
    fn at_most_three_hand_offs_in_ten_seconds() {
        let mut limiter = HandOffs::default();
        assert!(limiter.allow(0));
        assert!(limiter.allow(100));
        assert!(limiter.allow(200));
        assert!(!limiter.allow(9_999));
        assert!(limiter.allow(10_000));
    }

    #[test]
    fn the_manifest_gives_a_name_and_a_display() {
        let manifest = read_manifest(
            &json!({ "manifestVersion": 1, "name": "  Calc  ", "display": "immersive" }),
        );
        assert_eq!(manifest.name.as_deref(), Some("Calc"));
        assert_eq!(manifest.display, Some(Display::Clean));
        let earlier = read_manifest(&json!({ "manifestVersion": 1, "display": "standard" }));
        assert_eq!(earlier.display, Some(Display::Titled));
        assert_eq!(read_manifest(&json!({ "name": "x" })), Manifest::default());
        assert_eq!(
            read_manifest(&json!({ "manifestVersion": 2, "name": "x" })),
            Manifest::default()
        );
        let long = "n".repeat(TITLE_LIMIT + 1);
        assert_eq!(
            read_manifest(&json!({ "manifestVersion": 1, "name": long })).name,
            None
        );
        assert_eq!(
            read_manifest(&json!({ "manifestVersion": 1, "name": "  " })).name,
            None
        );
    }

    #[test]
    fn an_external_page_never_reads_the_manifest_and_is_always_titled() {
        assert!(!fetches_manifest(Trust::External));
        assert!(fetches_manifest(Trust::Reviewed));
        assert!(fetches_manifest(Trust::FirstParty));
        let clean = Manifest {
            name: None,
            display: Some(Display::Clean),
        };
        assert_eq!(display_of(Trust::External, &clean), Display::Titled);
        assert_eq!(display_of(Trust::Reviewed, &clean), Display::Clean);
        assert_eq!(
            display_of(Trust::Reviewed, &Manifest::default()),
            Display::Titled
        );
    }

    #[test]
    fn the_bar_title_follows_the_requested_document_opened_manifest_order() {
        let mut shown = Titles {
            requested: None,
            document: None,
            manifest_name: Some("Manifest".into()),
        };
        let title = |opened: Option<&str>, shown: &Titles| {
            bar_title_of(ORIGIN, Trust::Reviewed, opened, shown)
        };
        assert_eq!(title(None, &shown), "Manifest");
        assert_eq!(title(Some("Opened"), &shown), "Opened");
        shown.document = Some("Doc".into());
        assert_eq!(title(Some("Opened"), &shown), "Doc");
        shown.requested = Some(" Asked ".into());
        assert_eq!(title(Some("Opened"), &shown), "Asked");
        shown.requested = Some("   ".into());
        assert_eq!(title(Some("Opened"), &shown), "Doc");
        let none = Titles::default();
        assert_eq!(title(None, &none), "calc.apps.chatic.io");
        assert_eq!(
            bar_title_of(ORIGIN, Trust::External, Some("Mine"), &shown),
            "calc.apps.chatic.io"
        );
        assert_eq!(
            bar_title_of("http://localhost:5100", Trust::Reviewed, None, &none),
            "localhost:5100"
        );
    }
}
