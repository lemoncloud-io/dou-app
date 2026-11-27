use std::future::Future;

use std::net::SocketAddr;
use std::sync::Arc;

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::{Client, header, redirect};
use url::Url;

use crate::{MAX_BYTES, TIMEOUT, public_only};

struct PublicOnly;

pub(crate) fn only_public(
    found: std::io::Result<impl Iterator<Item = SocketAddr>>,
) -> Result<Vec<SocketAddr>, Box<dyn std::error::Error + Send + Sync>> {
    let public = public_only(found?);
    if public.is_empty() {
        return Err("the host resolves only to private addresses".into());
    }
    Ok(public)
}

impl Resolve for PublicOnly {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let found = tokio::net::lookup_host((name.as_str(), 0)).await;
            Ok(Box::new(only_public(found)?.into_iter()) as Addrs)
        })
    }
}

#[derive(Clone, Debug)]
pub struct Reply {
    pub status: u16,
    pub location: Option<String>,
    pub content_type: String,
    pub body: Vec<u8>,
}

pub trait Fetch {
    fn get(&self, url: &Url) -> impl Future<Output = Option<Reply>> + Send;
}

pub struct Web {
    client: Client,
}

impl Web {
    pub fn new() -> Option<Self> {
        let client = Client::builder()
            .redirect(redirect::Policy::none())
            .dns_resolver(Arc::new(PublicOnly))
            .timeout(TIMEOUT)
            .build()
            .ok()?;
        Some(Self { client })
    }
}

impl Fetch for Web {
    async fn get(&self, url: &Url) -> Option<Reply> {
        let mut response = self
            .client
            .get(url.clone())
            .header(header::ACCEPT, "text/html,application/xhtml+xml")
            .send()
            .await
            .ok()?;
        let header_text = |name| {
            response
                .headers()
                .get(name)
                .and_then(|value| value.to_str().ok())
                .map(str::to_string)
        };
        let status = response.status().as_u16();
        let location = header_text(header::LOCATION);
        let content_type = header_text(header::CONTENT_TYPE).unwrap_or_default();
        let mut body = Vec::new();
        if response.status().is_success() && content_type.to_ascii_lowercase().contains("html") {
            while let Some(chunk) = response.chunk().await.ok()? {
                body.extend_from_slice(&chunk);
                if body.len() >= MAX_BYTES {
                    body.truncate(MAX_BYTES);
                    break;
                }
            }
        }
        Some(Reply {
            status,
            location,
            content_type,
            body,
        })
    }
}

#[cfg(test)]
mod tests {
    use tokio::net::TcpListener;

    use super::*;

    fn addrs(list: &[&str]) -> std::io::Result<std::vec::IntoIter<SocketAddr>> {
        Ok(list
            .iter()
            .map(|text| text.parse().unwrap())
            .collect::<Vec<SocketAddr>>()
            .into_iter())
    }

    #[test]
    fn a_name_that_resolves_only_to_private_addresses_fails() {
        for list in [
            &["127.0.0.1:0"][..],
            &["10.0.0.1:0", "[fd00::1]:0"],
            &["169.254.169.254:0"],
            &["[::ffff:127.0.0.1]:0"],
            &[],
        ] {
            assert!(only_public(addrs(list)).is_err(), "{list:?}");
        }
    }

    #[test]
    fn a_mixed_answer_keeps_only_the_public_addresses() {
        let kept = only_public(addrs(&["127.0.0.1:0", "93.184.216.34:0"])).unwrap();
        assert_eq!(kept, ["93.184.216.34:0".parse::<SocketAddr>().unwrap()]);
    }

    #[test]
    fn a_lookup_error_is_passed_on() {
        let failed: std::io::Result<std::vec::IntoIter<SocketAddr>> =
            Err(std::io::Error::other("no such host"));
        assert!(only_public(failed).is_err());
    }

    #[tokio::test]
    async fn the_web_client_never_connects_to_a_name_that_resolves_to_loopback() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let accepted = tokio::spawn(async move { listener.accept().await.is_ok() });
        let web = Web::new().unwrap();
        let url = Url::parse(&format!("http://localhost:{port}/")).unwrap();
        assert!(web.get(&url).await.is_none());
        accepted.abort();
        assert!(accepted.await.is_err());
    }
}
