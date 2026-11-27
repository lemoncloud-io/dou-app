use std::future::Future;

use std::net::SocketAddr;
use std::sync::Arc;

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::{Client, header, redirect};
use url::Url;

use crate::{MAX_BYTES, TIMEOUT, public_only};

struct PublicOnly;

impl Resolve for PublicOnly {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let found = tokio::net::lookup_host((name.as_str(), 0)).await?;
            let public: Vec<SocketAddr> = public_only(found);
            if public.is_empty() {
                return Err("the host resolves only to private addresses".into());
            }
            Ok(Box::new(public.into_iter()) as Addrs)
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
