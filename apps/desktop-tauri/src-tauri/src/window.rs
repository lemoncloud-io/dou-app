use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use url::Url;

const DEV_WEB_URL: &str = "https://dou-dev.chatic.io";
const PROD_WEB_URL: &str = "https://dou.chatic.io";

pub fn web_url() -> String {
    if let Some(url) = option_env!("DOU_WEB_URL") {
        return url.to_string();
    }
    if cfg!(debug_assertions) {
        DEV_WEB_URL
    } else {
        PROD_WEB_URL
    }
    .to_string()
}

pub fn loader_path(web: &str) -> String {
    let query = Url::parse_with_params("http://x/", &[("to", web)])
        .map(|u| u.query().unwrap_or_default().to_string())
        .unwrap_or_default();
    format!("index.html?{query}")
}

pub fn open_main(app: &AppHandle, web: &str, init_script: &str) -> tauri::Result<()> {
    let path = loader_path(web);
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App(path.into()))
        .title("DoU")
        .initialization_script(init_script)
        .inner_size(1100.0, 760.0)
        .min_inner_size(420.0, 560.0)
        .build()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_loader_carries_the_web_url_encoded() {
        assert_eq!(
            loader_path("https://dou-dev.chatic.io"),
            "index.html?to=https%3A%2F%2Fdou-dev.chatic.io"
        );
    }
}
