use std::sync::{Mutex, MutexGuard};

use url::Url;

pub const START_TTL_MS: u64 = 10 * 60 * 1000;
pub const SCHEMES: [&str; 2] = ["chatic", "chatic-dev"];
const HANDOFF_PATH: &str = "/auth/oauth-response";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provider {
    Google,
    Apple,
}

impl Provider {
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "google" => Some(Self::Google),
            "apple" => Some(Self::Apple),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Google => "google",
            Self::Apple => "apple",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Start {
    pub provider: Provider,
    pub started_at_ms: u64,
    pub nonce: String,
}

pub fn authorize_url(relay: &str, handoff_origin: &str, start: &Start) -> Option<Url> {
    let relay = Url::parse(relay).ok()?;
    let mut handoff = Url::parse(handoff_origin).ok()?;
    if !matches!(relay.scheme(), "https" | "http") || !matches!(handoff.scheme(), "https" | "http")
    {
        return None;
    }
    handoff.set_path(HANDOFF_PATH);
    handoff.set_query(None);
    handoff
        .query_pairs_mut()
        .append_pair("nonce", &start.nonce)
        .append_pair("provider", start.provider.as_str());
    let mut url = relay
        .join(&format!("/oauth/{}/authorize", start.provider.as_str()))
        .ok()?;
    url.query_pairs_mut()
        .append_pair("redirect", handoff.as_str());
    Some(url)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Deeplink {
    pub provider: Provider,
    pub code: String,
    pub nonce: Option<String>,
}

pub fn parse_deeplink(raw: &str) -> Option<Deeplink> {
    let url = Url::parse(raw).ok()?;
    if !SCHEMES.contains(&url.scheme()) {
        return None;
    }
    if !url.host_str()?.eq_ignore_ascii_case("oauth")
        || !url.username().is_empty()
        || url.password().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return None;
    }
    let mut code = None;
    let mut provider = None;
    let mut nonce = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" if code.is_none() => code = Some(value.into_owned()),
            "provider" if provider.is_none() => provider = Provider::parse(&value),
            "nonce" if nonce.is_none() => nonce = Some(value.into_owned()),
            _ => {}
        }
    }
    let code = code.filter(|code| !code.is_empty())?;
    Some(Deeplink {
        provider: provider?,
        code,
        nonce: nonce.filter(|nonce| !nonce.is_empty()),
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rejection {
    NoStart,
    Expired,
    ProviderMismatch,
    NonceMissing,
    NonceMismatch,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Accepted {
    pub provider: Provider,
    pub code: String,
}

pub fn judge(start: Option<&Start>, link: &Deeplink, now_ms: u64) -> Result<(), Rejection> {
    let start = start.ok_or(Rejection::NoStart)?;
    if now_ms < start.started_at_ms || now_ms - start.started_at_ms >= START_TTL_MS {
        return Err(Rejection::Expired);
    }
    if start.provider != link.provider {
        return Err(Rejection::ProviderMismatch);
    }
    match &link.nonce {
        None => Err(Rejection::NonceMissing),
        Some(nonce) if *nonce != start.nonce => Err(Rejection::NonceMismatch),
        Some(_) => Ok(()),
    }
}

#[derive(Default)]
pub struct Pending(Mutex<Option<Start>>);

impl Pending {
    fn slot(&self) -> MutexGuard<'_, Option<Start>> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn begin(&self, start: Start) {
        *self.slot() = Some(start);
    }

    pub fn accept(&self, link: &Deeplink, now_ms: u64) -> Result<Accepted, Rejection> {
        let start = self.slot().take();
        judge(start.as_ref(), link, now_ms)?;
        Ok(Accepted {
            provider: link.provider,
            code: link.code.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn start() -> Start {
        Start {
            provider: Provider::Google,
            started_at_ms: 1_000,
            nonce: "abc123".into(),
        }
    }

    fn link(provider: Provider, nonce: Option<&str>) -> Deeplink {
        Deeplink {
            provider,
            code: "the-code".into(),
            nonce: nonce.map(str::to_string),
        }
    }

    #[test]
    fn the_authorize_address_goes_to_the_relay_and_returns_to_the_handoff_page() {
        let url = authorize_url(
            "https://oauth2.eureka.codes",
            "https://desktop.dou.chatic.io",
            &start(),
        )
        .unwrap();
        assert_eq!(
            url.origin().ascii_serialization(),
            "https://oauth2.eureka.codes"
        );
        assert_eq!(url.path(), "/oauth/google/authorize");
        let redirect = url
            .query_pairs()
            .find(|(key, _)| key == "redirect")
            .unwrap()
            .1
            .into_owned();
        let back = Url::parse(&redirect).unwrap();
        assert_eq!(
            back.origin().ascii_serialization(),
            "https://desktop.dou.chatic.io"
        );
        assert_eq!(back.path(), "/auth/oauth-response");
        let pairs: Vec<_> = back
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        assert_eq!(
            pairs,
            [
                ("nonce".into(), "abc123".into()),
                ("provider".into(), "google".into())
            ]
        );
    }

    #[test]
    fn an_address_that_is_not_http_is_refused() {
        assert!(authorize_url("javascript:1", "https://h.test", &start()).is_none());
        assert!(authorize_url("https://r.test", "file:///x", &start()).is_none());
        assert!(authorize_url("nope", "https://h.test", &start()).is_none());
    }

    #[test]
    fn a_deeplink_of_either_scheme_parses() {
        let expected = link(Provider::Apple, Some("n1"));
        for scheme in ["chatic", "chatic-dev"] {
            let raw = format!("{scheme}://oauth?provider=apple&code=the-code&nonce=n1");
            assert_eq!(parse_deeplink(&raw), Some(expected.clone()), "{raw}");
        }
        assert_eq!(
            parse_deeplink("chatic://oauth/?provider=google&code=c"),
            Some(Deeplink {
                provider: Provider::Google,
                code: "c".into(),
                nonce: None
            })
        );
    }

    #[test]
    fn anything_else_does_not_parse() {
        for raw in [
            "https://oauth?provider=google&code=c",
            "chatic://open?provider=google&code=c",
            "chatic://oauth/x?provider=google&code=c",
            "chatic://user@oauth?provider=google&code=c",
            "chatic://oauth?provider=google",
            "chatic://oauth?provider=google&code=",
            "chatic://oauth?provider=kakao&code=c",
            "chatic://oauth?code=c",
            "not a url",
        ] {
            assert_eq!(parse_deeplink(raw), None, "{raw}");
        }
    }

    #[test]
    fn a_repeated_query_key_does_not_override_the_first() {
        let parsed =
            parse_deeplink("chatic://oauth?provider=google&code=a&code=b&nonce=x&nonce=y").unwrap();
        assert_eq!(
            (parsed.code.as_str(), parsed.nonce.as_deref()),
            ("a", Some("x"))
        );
    }

    #[test]
    fn the_verdict_table() {
        let s = start();
        let ok = link(Provider::Google, Some("abc123"));
        assert_eq!(judge(Some(&s), &ok, 1_000 + START_TTL_MS - 1), Ok(()));
        assert_eq!(judge(None, &ok, 1_000), Err(Rejection::NoStart));
        assert_eq!(
            judge(Some(&s), &ok, 1_000 + START_TTL_MS),
            Err(Rejection::Expired)
        );
        assert_eq!(judge(Some(&s), &ok, 999), Err(Rejection::Expired));
        assert_eq!(
            judge(Some(&s), &link(Provider::Apple, Some("abc123")), 2_000),
            Err(Rejection::ProviderMismatch)
        );
        assert_eq!(
            judge(Some(&s), &link(Provider::Google, None), 2_000),
            Err(Rejection::NonceMissing)
        );
        assert_eq!(
            judge(Some(&s), &link(Provider::Google, Some("other")), 2_000),
            Err(Rejection::NonceMismatch)
        );
    }

    #[test]
    fn a_matching_link_is_accepted_once() {
        let pending = Pending::default();
        pending.begin(start());
        let ok = link(Provider::Google, Some("abc123"));
        assert_eq!(
            pending.accept(&ok, 2_000),
            Ok(Accepted {
                provider: Provider::Google,
                code: "the-code".into()
            })
        );
        assert_eq!(pending.accept(&ok, 2_000), Err(Rejection::NoStart));
    }

    #[test]
    fn a_refused_link_spends_the_start() {
        let pending = Pending::default();
        pending.begin(start());
        assert_eq!(
            pending.accept(&link(Provider::Google, Some("wrong")), 2_000),
            Err(Rejection::NonceMismatch)
        );
        assert_eq!(
            pending.accept(&link(Provider::Google, Some("abc123")), 2_000),
            Err(Rejection::NoStart)
        );
    }

    #[test]
    fn a_new_start_replaces_the_old_one() {
        let pending = Pending::default();
        pending.begin(start());
        pending.begin(Start {
            nonce: "second".into(),
            ..start()
        });
        assert_eq!(
            pending.accept(&link(Provider::Google, Some("abc123")), 2_000),
            Err(Rejection::NonceMismatch)
        );
    }
}
