use std::io::{self, Read};
use std::net::{Ipv4Addr, SocketAddr, TcpListener};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use url::Url;

use crate::bridge::origin_of;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "miniApp")]
    pub mini_app: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "miniPort")]
    pub mini_port: Option<u16>,
}

impl AppConfig {
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        let text = serde_json::to_string_pretty(self).map_err(io::Error::other)?;
        let staged = path.with_extension("json.tmp");
        std::fs::write(&staged, text)?;
        std::fs::rename(&staged, path)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppSource {
    Default,
    Url(String),
    Folder(PathBuf),
}

impl AppSource {
    pub fn parse(text: &str) -> Result<Self, String> {
        if text.starts_with("http://") || text.starts_with("https://") {
            origin_of(text).ok_or_else(|| {
                format!("not a usable web address (https, or http on localhost): {text}")
            })?;
            return Ok(Self::Url(text.to_string()));
        }
        let folder = Path::new(text)
            .canonicalize()
            .map_err(|e| format!("cannot open the app folder {text}: {e}"))?;
        if !folder.join("index.html").is_file() {
            return Err(format!("{} has no index.html", folder.display()));
        }
        Ok(Self::Folder(folder))
    }

    pub fn parse_main(text: &str) -> Result<Self, String> {
        let source = Self::parse(text)?;
        if cfg!(debug_assertions) {
            return Ok(source);
        }
        release_main(source, &crate::window::web_url())
    }

    pub fn describe(&self) -> Option<String> {
        match self {
            Self::Default => None,
            Self::Url(url) => Some(url.clone()),
            Self::Folder(folder) => Some(folder.display().to_string()),
        }
    }

    pub fn from_config(config: &AppConfig) -> Self {
        config
            .app
            .as_deref()
            .and_then(|text| Self::parse_main(text).ok())
            .unwrap_or(Self::Default)
    }
}

fn release_main(source: AppSource, baked_url: &str) -> Result<AppSource, String> {
    let allowed = [
        crate::window::DEV_WEB_URL,
        crate::window::PROD_WEB_URL,
        baked_url,
    ]
    .map(origin_of);
    match &source {
        AppSource::Default => Ok(source),
        AppSource::Url(url) if origin_of(url).is_some_and(|o| allowed.contains(&Some(o))) => {
            Ok(source)
        }
        AppSource::Url(url) => Err(format!(
            "a release build loads only the DoU web as the main window: {url}"
        )),
        AppSource::Folder(folder) => Err(format!(
            "a release build does not serve a local folder as the main window: {}",
            folder.display()
        )),
    }
}

pub struct Served {
    pub url: String,
    pub port: u16,
}

pub fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("html" | "htm") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json" | "map") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("wasm") => "application/wasm",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn decode(raw: &str) -> Option<String> {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'%' {
            let hex = std::str::from_utf8(bytes.get(at + 1..at + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            at += 3;
        } else {
            out.push(bytes[at]);
            at += 1;
        }
    }
    String::from_utf8(out).ok()
}

pub fn resolve(root: &Path, request_path: &str) -> Option<PathBuf> {
    let path = request_path.split(['?', '#']).next().unwrap_or("");
    let decoded = decode(path)?;
    if decoded.contains(['\0', '\\']) {
        return None;
    }
    let mut target = root.to_path_buf();
    for component in Path::new(decoded.trim_start_matches('/')).components() {
        match component {
            Component::Normal(part) => target.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    let wants_page = decoded.ends_with('/') || target.extension().is_none();
    let chosen = if target.is_dir() {
        target.join("index.html")
    } else if target.is_file() {
        target
    } else if wants_page {
        root.join("index.html")
    } else {
        return None;
    };
    let real = chosen.canonicalize().ok()?;
    (real.starts_with(root) && real.is_file()).then_some(real)
}

fn bind(preferred: Option<u16>) -> io::Result<TcpListener> {
    if let Some(port) = preferred
        && let Ok(listener) = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, port)))
    {
        return Ok(listener);
    }
    TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))
}

pub fn serve(root: &Path, preferred_port: Option<u16>) -> io::Result<Served> {
    let root = Arc::new(root.canonicalize()?);
    let listener = bind(preferred_port)?;
    let port = listener.local_addr()?.port();
    let server = tiny_http::Server::from_listener(listener, None).map_err(io::Error::other)?;
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let root = Arc::clone(&root);
            std::thread::spawn(move || answer(&root, request));
        }
    });
    Ok(Served {
        url: format!("http://localhost:{port}/"),
        port,
    })
}

fn answer(root: &Path, request: tiny_http::Request) {
    let method = request.method().clone();
    if method != tiny_http::Method::Get && method != tiny_http::Method::Head {
        let _ = request.respond(tiny_http::Response::empty(405));
        return;
    }
    let Some(file) = resolve(root, request.url()) else {
        let _ = request.respond(tiny_http::Response::empty(404));
        return;
    };
    let Ok(mut handle) = std::fs::File::open(&file) else {
        let _ = request.respond(tiny_http::Response::empty(404));
        return;
    };
    let mut body = Vec::new();
    if handle.read_to_end(&mut body).is_err() {
        let _ = request.respond(tiny_http::Response::empty(500));
        return;
    }
    let header = |name: &str, value: &str| {
        tiny_http::Header::from_bytes(name.as_bytes(), value.as_bytes()).ok()
    };
    let mut response = tiny_http::Response::from_data(if method == tiny_http::Method::Head {
        Vec::new()
    } else {
        body
    });
    for (name, value) in [
        ("Content-Type", content_type(&file)),
        ("Cache-Control", "no-store"),
    ] {
        if let Some(h) = header(name, value) {
            response.add_header(h);
        }
    }
    let _ = request.respond(response);
}

pub struct Resolved {
    pub source: AppSource,
    pub web_url: String,
    pub port: Option<u16>,
}

pub fn resolve_source(
    source: AppSource,
    default_url: &str,
    preferred_port: Option<u16>,
) -> Result<Resolved, String> {
    match &source {
        AppSource::Default => Ok(Resolved {
            web_url: default_url.to_string(),
            source,
            port: None,
        }),
        AppSource::Url(url) => Ok(Resolved {
            web_url: Url::parse(url).map_err(|e| e.to_string())?.to_string(),
            source,
            port: None,
        }),
        AppSource::Folder(folder) => {
            let served = serve(folder, preferred_port).map_err(|e| e.to_string())?;
            Ok(Resolved {
                web_url: served.url,
                source,
                port: Some(served.port),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn site() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().expect("temp dir");
        let root = dir.path().join("dist");
        std::fs::create_dir_all(root.join("assets")).expect("assets");
        std::fs::write(root.join("index.html"), "<html>home</html>").expect("index");
        std::fs::write(root.join("assets/app.js"), "1").expect("js");
        std::fs::write(dir.path().join("secret.txt"), "no").expect("secret");
        let root = root.canonicalize().expect("canonical");
        (dir, root)
    }

    #[test]
    fn a_url_must_be_https_or_localhost() {
        assert!(AppSource::parse("https://dou-dev.chatic.io").is_ok());
        assert!(AppSource::parse("http://localhost:4200").is_ok());
        assert!(AppSource::parse("http://example.test").is_err());
    }

    #[test]
    fn a_release_build_keeps_the_main_window_on_the_dou_web() {
        let baked = "http://localhost:4174";
        for url in [
            "https://dou.chatic.io/",
            "https://dou-dev.chatic.io/rooms/1",
            "http://localhost:4174/",
        ] {
            let source = AppSource::parse(url).expect("parses");
            assert_eq!(release_main(source.clone(), baked), Ok(source), "{url}");
        }
        for url in [
            "https://evil.example/",
            "https://dou.chatic.io.evil.example/",
            "http://localhost:4200/",
        ] {
            let source = AppSource::parse(url).expect("parses");
            assert!(release_main(source, baked).is_err(), "{url}");
        }
        let (_dir, root) = site();
        assert!(release_main(AppSource::Folder(root), baked).is_err());
        assert_eq!(
            release_main(AppSource::Default, baked),
            Ok(AppSource::Default)
        );
    }

    #[test]
    fn a_folder_needs_an_index_page() {
        let (dir, root) = site();
        assert_eq!(
            AppSource::parse(root.to_str().expect("utf8")),
            Ok(AppSource::Folder(root))
        );
        assert!(AppSource::parse(dir.path().to_str().expect("utf8")).is_err());
        assert!(AppSource::parse("/no/such/folder").is_err());
    }

    #[test]
    fn requests_resolve_inside_the_root_and_unknown_pages_fall_back_to_the_index() {
        let (_dir, root) = site();
        assert_eq!(
            resolve(&root, "/assets/app.js?v=1"),
            Some(root.join("assets/app.js"))
        );
        assert_eq!(resolve(&root, "/"), Some(root.join("index.html")));
        assert_eq!(resolve(&root, "/rooms/42"), Some(root.join("index.html")));
        assert_eq!(resolve(&root, "/missing.js"), None);
    }

    #[test]
    fn a_request_cannot_leave_the_root() {
        let (_dir, root) = site();
        for path in [
            "/../secret.txt",
            "/%2e%2e/secret.txt",
            "/assets/..%2f..%2fsecret.txt",
            "/..%5csecret.txt",
            "/a%00b",
            "//etc/passwd",
        ] {
            let found = resolve(&root, path);
            assert!(
                found.as_ref().is_none_or(|f| f.starts_with(&root)),
                "{path} escaped to {found:?}"
            );
            assert_ne!(
                found.and_then(|f| f.file_name().map(|n| n.to_owned())),
                Some("secret.txt".into()),
                "{path}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_out_of_the_root_is_refused() {
        let (dir, root) = site();
        std::os::unix::fs::symlink(dir.path().join("secret.txt"), root.join("leak.txt"))
            .expect("link");
        assert_eq!(resolve(&root, "/leak.txt"), None);
    }

    #[test]
    fn the_server_answers_over_http_and_keeps_its_port_when_it_is_free() {
        use std::io::{Read, Write};
        let (_dir, root) = site();
        let first = serve(&root, None).expect("serve");
        let mut stream = std::net::TcpStream::connect(("127.0.0.1", first.port)).expect("connect");
        stream
            .write_all(b"GET /rooms/1 HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .expect("write");
        let mut reply = String::new();
        stream.read_to_string(&mut reply).expect("read");
        assert!(reply.starts_with("HTTP/1.1 200"));
        assert!(reply.contains("home"));
        let busy = serve(&root, Some(first.port)).expect("fallback");
        assert_ne!(busy.port, first.port);
    }

    #[test]
    fn the_config_round_trips_and_a_broken_file_is_empty() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("app.json");
        assert_eq!(AppConfig::load(&path), AppConfig::default());
        let config = AppConfig {
            app: Some("https://x.test".into()),
            port: Some(5000),
            mini_app: Some("./dist".into()),
            mini_port: Some(5001),
        };
        config.save(&path).expect("save");
        assert_eq!(AppConfig::load(&path), config);
        std::fs::write(&path, "{ nope").expect("write");
        assert_eq!(AppConfig::load(&path), AppConfig::default());
    }
}
