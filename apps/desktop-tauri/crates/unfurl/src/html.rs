use regex::Regex;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Metadata {
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub site_name: Option<String>,
}

fn decode_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#039;", "'")
        .replace("&#39;", "'")
}

fn meta_content(html: &str, key: &str) -> Option<String> {
    let key = regex::escape(key);
    let forward =
        format!(r#"(?i)<meta[^>]+(?:property|name)=["']{key}["'][^>]*content=["']([^"']*)["']"#);
    let backward =
        format!(r#"(?i)<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']{key}["']"#);
    [forward, backward]
        .iter()
        .find_map(|pattern| {
            Regex::new(pattern)
                .ok()?
                .captures(html)?
                .get(1)
                .map(|m| m.as_str().to_string())
        })
        .map(|raw| decode_entities(&raw).trim().to_string())
        .filter(|value| !value.is_empty())
}

fn title_tag(html: &str) -> Option<String> {
    let found = Regex::new(r"(?i)<title[^>]*>([^<]*)</title>")
        .ok()?
        .captures(html)?;
    Some(decode_entities(&found[1]).trim().to_string()).filter(|value| !value.is_empty())
}

fn https_only(url: String) -> Option<String> {
    url.get(..8)
        .is_some_and(|head| head.eq_ignore_ascii_case("https://"))
        .then_some(url)
}

pub fn parse(html: &str) -> Option<Metadata> {
    let title = meta_content(html, "og:title").or_else(|| title_tag(html))?;
    Some(Metadata {
        title,
        description: meta_content(html, "og:description")
            .or_else(|| meta_content(html, "description")),
        image_url: meta_content(html, "og:image").and_then(https_only),
        site_name: meta_content(html, "og:site_name"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_graph_fields_win_over_the_title_tag() {
        let page = r#"<head><title>Plain</title>
            <meta property="og:title" content="Rich &amp; Famous">
            <meta property="og:description" content="  About  ">
            <meta property="og:image" content="https://cdn.test/i.png">
            <meta property="og:site_name" content="Site"></head>"#;
        let metadata = parse(page).unwrap();
        assert_eq!(metadata.title, "Rich & Famous");
        assert_eq!(metadata.description.as_deref(), Some("About"));
        assert_eq!(
            metadata.image_url.as_deref(),
            Some("https://cdn.test/i.png")
        );
        assert_eq!(metadata.site_name.as_deref(), Some("Site"));
    }

    #[test]
    fn content_may_come_before_the_key() {
        let page = r#"<meta content="Backwards" property="og:title"><meta content="d" name="description">"#;
        let metadata = parse(page).unwrap();
        assert_eq!(metadata.title, "Backwards");
        assert_eq!(metadata.description.as_deref(), Some("d"));
    }

    #[test]
    fn the_title_tag_is_the_fallback_and_no_title_is_no_preview() {
        assert_eq!(parse("<TITLE> Hi </TITLE>").unwrap().title, "Hi");
        assert_eq!(parse("<title>   </title><p>x</p>"), None);
        assert_eq!(parse("<p>nothing</p>"), None);
    }

    #[test]
    fn only_an_https_image_is_kept() {
        for image in [
            "http://cdn.test/i.png",
            "data:image/png;base64,AA",
            "//cdn.test/i.png",
            "/i.png",
        ] {
            let page = format!(r#"<title>t</title><meta property="og:image" content="{image}">"#);
            assert_eq!(parse(&page).unwrap().image_url, None, "{image}");
        }
        let page = r#"<title>t</title><meta property="og:image" content="HTTPS://cdn.test/i.png">"#;
        assert!(parse(page).unwrap().image_url.is_some());
    }
}
