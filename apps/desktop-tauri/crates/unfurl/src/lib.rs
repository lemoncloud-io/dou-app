mod fetch;
mod guard;
mod html;

use std::time::Duration;

use url::Url;

pub use fetch::{Fetch, Reply, Web};
pub use guard::{is_fetchable, is_private_host};
pub use html::{Metadata, parse};

pub const TIMEOUT: Duration = Duration::from_secs(3);
pub const MAX_BYTES: usize = 256 * 1024;
pub const MAX_REDIRECTS: usize = 5;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Preview {
    pub success: bool,
    pub url: String,
    pub metadata: Option<Metadata>,
}

impl Preview {
    fn failed(url: &str) -> Self {
        Self {
            success: false,
            url: url.to_string(),
            metadata: None,
        }
    }
}

async fn follow<F: Fetch>(fetcher: &F, start: Url) -> Option<Reply> {
    let mut current = start;
    for _ in 0..=MAX_REDIRECTS {
        if !is_fetchable(&current) {
            return None;
        }
        let reply = fetcher.get(&current).await?;
        if !(300..400).contains(&reply.status) {
            return Some(reply);
        }
        current = current.join(reply.location.as_deref()?).ok()?;
    }
    None
}

pub async fn fetch_url_metadata<F: Fetch>(fetcher: &F, raw_url: &str) -> Preview {
    let Ok(target) = Url::parse(raw_url) else {
        return Preview::failed(raw_url);
    };
    let reply = match tokio::time::timeout(TIMEOUT, follow(fetcher, target)).await {
        Ok(Some(reply)) => reply,
        _ => return Preview::failed(raw_url),
    };
    if !(200..300).contains(&reply.status)
        || !reply.content_type.to_ascii_lowercase().contains("html")
    {
        return Preview::failed(raw_url);
    }
    match parse(&String::from_utf8_lossy(&reply.body)) {
        Some(metadata) => Preview {
            success: true,
            url: raw_url.to_string(),
            metadata: Some(metadata),
        },
        None => Preview::failed(raw_url),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    struct Fake {
        pages: HashMap<String, Reply>,
        asked: Mutex<Vec<String>>,
    }

    impl Fake {
        fn page(mut self, url: &str, reply: Reply) -> Self {
            self.pages.insert(url.to_string(), reply);
            self
        }
        fn asked(&self) -> Vec<String> {
            self.asked.lock().unwrap().clone()
        }
    }

    impl Fetch for Fake {
        async fn get(&self, url: &Url) -> Option<Reply> {
            self.asked.lock().unwrap().push(url.to_string());
            self.pages.get(url.as_str()).cloned()
        }
    }

    fn html(body: &str) -> Reply {
        Reply {
            status: 200,
            location: None,
            content_type: "text/html; charset=utf-8".into(),
            body: body.as_bytes().to_vec(),
        }
    }

    fn redirect(to: &str) -> Reply {
        Reply {
            status: 302,
            location: Some(to.into()),
            content_type: String::new(),
            body: vec![],
        }
    }

    #[tokio::test]
    async fn a_page_with_a_title_becomes_a_preview() {
        let fake = Fake::default().page(
            "https://a.test/x",
            html("<title>Hi</title><meta property=\"og:image\" content=\"https://a.test/i.png\">"),
        );
        let preview = fetch_url_metadata(&fake, "https://a.test/x").await;
        assert!(preview.success);
        let metadata = preview.metadata.unwrap();
        assert_eq!(metadata.title, "Hi");
        assert_eq!(metadata.image_url.as_deref(), Some("https://a.test/i.png"));
    }

    #[tokio::test]
    async fn a_private_target_is_never_asked() {
        for url in [
            "http://localhost/",
            "http://127.0.0.1/",
            "http://10.0.0.5/",
            "http://169.254.169.254/latest/meta-data",
            "http://[::1]/",
            "http://printer/",
            "ftp://a.test/",
            "file:///etc/passwd",
        ] {
            let fake = Fake::default();
            let preview = fetch_url_metadata(&fake, url).await;
            assert!(!preview.success, "{url}");
            assert!(fake.asked().is_empty(), "{url}");
        }
    }

    #[tokio::test]
    async fn every_redirect_hop_is_checked() {
        let fake = Fake::default()
            .page("https://a.test/", redirect("/next"))
            .page("https://a.test/next", redirect("http://169.254.169.254/"))
            .page("http://169.254.169.254/", html("<title>secret</title>"));
        let preview = fetch_url_metadata(&fake, "https://a.test/").await;
        assert!(!preview.success);
        assert_eq!(fake.asked(), ["https://a.test/", "https://a.test/next"]);
    }

    #[tokio::test]
    async fn at_most_five_redirects_are_followed() {
        let mut fake = Fake::default();
        for hop in 0..=6 {
            fake = fake.page(
                &format!("https://a.test/{hop}"),
                redirect(&format!("/{}", hop + 1)),
            );
        }
        fake = fake.page("https://a.test/6", html("<title>late</title>"));
        assert!(!fetch_url_metadata(&fake, "https://a.test/0").await.success);

        let mut fake = Fake::default();
        for hop in 0..5 {
            fake = fake.page(
                &format!("https://a.test/{hop}"),
                redirect(&format!("/{}", hop + 1)),
            );
        }
        fake = fake.page("https://a.test/5", html("<title>ok</title>"));
        assert!(fetch_url_metadata(&fake, "https://a.test/0").await.success);
    }

    #[tokio::test]
    async fn a_redirect_without_a_location_fails() {
        let fake = Fake::default().page(
            "https://a.test/",
            Reply {
                status: 301,
                location: None,
                content_type: String::new(),
                body: vec![],
            },
        );
        assert!(!fetch_url_metadata(&fake, "https://a.test/").await.success);
    }

    #[tokio::test]
    async fn not_html_or_not_ok_or_no_title_fails() {
        let json = Reply {
            content_type: "application/json".into(),
            ..html("{}")
        };
        let missing = Reply {
            status: 404,
            ..html("<title>x</title>")
        };
        let fake = Fake::default()
            .page("https://a.test/json", json)
            .page("https://a.test/404", missing)
            .page("https://a.test/blank", html("<p>no title</p>"));
        for path in ["json", "404", "blank", "unknown"] {
            let url = format!("https://a.test/{path}");
            assert!(!fetch_url_metadata(&fake, &url).await.success, "{url}");
        }
    }

    #[tokio::test]
    async fn a_page_that_never_answers_fails_after_the_timeout() {
        struct Slow;
        impl Fetch for Slow {
            async fn get(&self, _: &Url) -> Option<Reply> {
                tokio::time::sleep(Duration::from_secs(30)).await;
                None
            }
        }
        tokio::time::pause();
        assert!(!fetch_url_metadata(&Slow, "https://a.test/").await.success);
    }
}
