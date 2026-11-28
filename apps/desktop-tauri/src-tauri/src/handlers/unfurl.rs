use std::sync::Arc;

use ::unfurl::{Fetch, Preview, Web, fetch_url_metadata};
use bridge_host::BridgeHost;
use serde_json::{Value, json};

use super::Context;

pub fn reply(preview: &Preview) -> Value {
    let mut data = json!({ "success": preview.success, "url": preview.url });
    if let Some(metadata) = &preview.metadata {
        data["title"] = json!(metadata.title);
        data["description"] = json!(metadata.description);
        data["imageUrl"] = json!(metadata.image_url);
        data["siteName"] = json!(metadata.site_name);
    }
    json!({ "type": "OnFetchUrlMetadata", "success": true, "data": data })
}

pub async fn answer<F: Fetch + Sync>(fetcher: Option<&F>, message: &Value) -> Value {
    let url = message["data"]["url"].as_str().unwrap_or_default();
    match fetcher {
        Some(fetcher) => reply(&fetch_url_metadata(fetcher, url).await),
        None => reply(&Preview {
            success: false,
            url: url.to_string(),
            metadata: None,
        }),
    }
}

pub fn register(host: &mut BridgeHost, _context: &Context) {
    let web = Arc::new(Web::new());
    host.register(
        "FetchUrlMetadata",
        Arc::new(move |message| {
            let web = web.clone();
            Box::pin(async move { Ok(Some(answer((*web).as_ref(), &message).await)) })
        }),
    );
}

#[cfg(test)]
mod tests {
    use ::unfurl::{Metadata, Reply};
    use url::Url;

    use super::*;

    struct Page(&'static str);

    impl Fetch for Page {
        async fn get(&self, _: &Url) -> Option<Reply> {
            Some(Reply {
                status: 200,
                location: None,
                content_type: "text/html".into(),
                body: self.0.as_bytes().to_vec(),
            })
        }
    }

    #[tokio::test]
    async fn a_preview_carries_the_fields_the_web_reads() {
        let message = json!({ "data": { "url": "https://a.test/" } });
        let page = Page(r#"<title>Hi</title><meta property="og:site_name" content="A">"#);
        let reply = answer(Some(&page), &message).await;
        assert_eq!(reply["type"], "OnFetchUrlMetadata");
        assert_eq!(reply["success"], true);
        assert_eq!(reply["data"]["success"], true);
        assert_eq!(reply["data"]["url"], "https://a.test/");
        assert_eq!(reply["data"]["title"], "Hi");
        assert_eq!(reply["data"]["siteName"], "A");
    }

    #[tokio::test]
    async fn a_refused_address_answers_a_failed_preview_not_an_error() {
        let page = Page("<title>secret</title>");
        for url in [
            "http://127.0.0.1/",
            "http://169.254.169.254/",
            "",
            "not a url",
        ] {
            let reply = answer(Some(&page), &json!({ "data": { "url": url } })).await;
            assert_eq!(reply["success"], true, "{url}");
            assert_eq!(reply["data"]["success"], false, "{url}");
            assert!(reply["data"].get("title").is_none(), "{url}");
        }
        let reply = answer(None::<&Page>, &json!({ "data": {} })).await;
        assert_eq!(reply["data"]["success"], false);
    }

    #[test]
    fn a_missing_description_and_image_are_null() {
        let preview = Preview {
            success: true,
            url: "https://a.test/".into(),
            metadata: Some(Metadata {
                title: "t".into(),
                description: None,
                image_url: None,
                site_name: None,
            }),
        };
        assert!(reply(&preview)["data"]["imageUrl"].is_null());
    }
}
