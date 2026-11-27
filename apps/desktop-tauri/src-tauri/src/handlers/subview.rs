use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use bridge_host::{BRIDGE_VERSION, BridgeHost, Config, ContextFn};
use serde_json::{Value, json};
use subview::page::{self, ErrorReports};
use subview::policy::{
    self, Display, HandOffs, Manifest, Navigation, Titles, bar_title_of, decide_navigation,
};
use subview::{Entry, MESSAGE_LIMIT, OpenRequest, Refusal, Trust, parse_dev, parse_open};
use tauri::ipc::CapabilityBuilder;
use tauri::webview::NewWindowResponse;
use tauri::{
    AppHandle, Manager, State, Webview, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use super::{Context, sync};
use crate::app_source::{AppSource, serve};
use crate::bridge::push_event;
use crate::globals::language_subtag;
use crate::logs;
use crate::shell_host::Running;

const MANIFEST_TIMEOUT: Duration = Duration::from_secs(3);
const MANIFEST_LIMIT: usize = 64 * 1024;

pub struct SubHost {
    views: subview::Views,
    live: Mutex<Option<Live>>,
    served: Mutex<HashMap<PathBuf, u16>>,
}

struct Live {
    entry: Entry,
    titles: Titles,
    display: Display,
    hand_offs: HandOffs,
    host: Arc<BridgeHost>,
}

impl Live {
    fn bar_title(&self) -> String {
        bar_title_of(
            &self.entry.origin,
            self.entry.trust,
            self.entry.title.as_deref(),
            &self.titles,
        )
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

fn label_of(view_id: &str) -> String {
    format!("subview-{view_id}")
}

fn host_state(app: &AppHandle) -> Arc<SubHost> {
    Arc::clone(&app.state::<Arc<SubHost>>())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

fn refused(response_type: &str, refusal: Refusal) -> Value {
    json!({
        "type": response_type,
        "success": false,
        "error": { "code": refusal.code(), "message": refusal.message() },
    })
}

fn trust_name(trust: Trust) -> &'static str {
    match trust {
        Trust::FirstParty => "firstParty",
        Trust::Reviewed => "reviewed",
        Trust::External => "external",
    }
}

pub fn entry_json(entry: &Entry) -> Value {
    json!({
        "viewId": entry.view_id,
        "url": entry.url,
        "origin": entry.origin,
        "trust": trust_name(entry.trust),
        "title": entry.title,
        "dev": entry.dev,
    })
}

fn closed_event(app: &AppHandle, view_id: &str, reason: &str, result: Option<&Value>) {
    let mut data = json!({ "viewId": view_id, "reason": reason });
    if let (Some(result), Some(map)) = (result, data.as_object_mut()) {
        map.insert("result".into(), result.clone());
    }
    push_event(app, "OnSubWebViewClosed", data);
}

fn destroy_window(app: &AppHandle, view_id: &str) {
    if let Some(window) = app.get_webview_window(&label_of(view_id)) {
        let _ = window.destroy();
    }
}

fn close_view(
    app: &AppHandle,
    view_id: Option<&str>,
    reason: &str,
    result: Option<Value>,
) -> Result<(), Refusal> {
    let sub = host_state(app);
    let entry = sub.views.close(view_id)?;
    *lock(&sub.live) = None;
    destroy_window(app, &entry.view_id);
    closed_event(app, &entry.view_id, reason, result.as_ref());
    Ok(())
}

pub fn reset_for_new_host(app: &AppHandle) {
    let Some(sub) = app.try_state::<Arc<SubHost>>() else {
        return;
    };
    if let Some(entry) = sub.views.current()
        && sub.views.closed(&entry.view_id)
    {
        *lock(&sub.live) = None;
        destroy_window(app, &entry.view_id);
    }
}

fn abort_view(app: &AppHandle, view_id: &str) {
    let sub = host_state(app);
    if sub.views.closed(view_id) {
        *lock(&sub.live) = None;
        destroy_window(app, view_id);
        closed_event(app, view_id, "system", None);
    }
}

fn refresh_title(app: &AppHandle, view_id: &str, title: &str) {
    if let Some(window) = app.get_webview_window(&label_of(view_id)) {
        let _ = window.set_title(title);
    }
}

fn new_host(app: &AppHandle, entry: &Entry) -> Arc<BridgeHost> {
    let label = label_of(&entry.view_id);
    let origin = entry.origin.clone();
    let sender = app.clone();
    let send_label = label.clone();
    let version = app.package_info().version.to_string();
    let context_app = app.clone();
    let context_entry = entry.clone();
    let context: ContextFn = Arc::new(move || {
        let dark = context_app
            .get_webview_window(&label)
            .and_then(|w| w.theme().ok())
            == Some(tauri::Theme::Dark);
        let locale = language_subtag(sys_locale::get_locale().as_deref());
        page::context(&context_entry, &version, &locale, dark)
    });
    let mut host = BridgeHost::new(Config {
        version: BRIDGE_VERSION.to_string(),
        send_to_web: Arc::new(move |message| {
            if let Some(window) = sender.get_webview_window(&send_label) {
                let _ = window.eval(page::deliver_script(&origin, &message));
            }
        }),
        sub_webview_open_scope: None,
        sub_webview_context: Some(context),
        max_message_length: Some(MESSAGE_LIMIT),
    });

    let id = entry.view_id.clone();
    let closer = app.clone();
    host.register(
        "FinishSubWebView",
        sync(move |message| {
            page::finish_reply(&message, |result| {
                close_view(&closer, Some(&id), "page", result.cloned())
            })
        }),
    );

    let id = entry.view_id.clone();
    let titler = app.clone();
    host.register(
        "SetSubWebViewTitle",
        sync(move |message| {
            page::title_reply(&message, |title| {
                let sub = host_state(&titler);
                let shown = lock(&sub.live)
                    .as_mut()
                    .filter(|l| l.entry.view_id == id)
                    .map(|l| {
                        l.titles.requested = Some(title);
                        l.bar_title()
                    });
                if let Some(shown) = shown {
                    refresh_title(&titler, &id, &shown);
                }
            })
        }),
    );

    let reports = ErrorReports::default();
    let origin = entry.origin.clone();
    host.register(
        "ReportSubWebViewError",
        sync(move |message| {
            reports.reply(&message, &origin, |error| {
                logs::shell(&format!(
                    "mini-app page error {}: {}{}",
                    error.origin,
                    error.message,
                    error
                        .stack
                        .map(|stack| format!("\n{stack}"))
                        .unwrap_or_default()
                ));
            })
        }),
    );
    Arc::new(host)
}

pub async fn fetch_manifest(origin: &str) -> Option<Value> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(MANIFEST_TIMEOUT)
        .build()
        .ok()?;
    let mut response = client
        .get(format!("{origin}/.well-known/chatic-app.json"))
        .send()
        .await
        .ok()?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|length| length as usize > MANIFEST_LIMIT)
    {
        return None;
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        body.extend_from_slice(&chunk);
        if body.len() > MANIFEST_LIMIT {
            return None;
        }
    }
    serde_json::from_slice(&body).ok()
}

fn on_navigate(app: &AppHandle, view_id: &str, origin: &str, target: &Url) -> bool {
    match decide_navigation(target.as_str(), origin) {
        Navigation::Load => {
            let sub = host_state(app);
            let shown = lock(&sub.live)
                .as_mut()
                .filter(|l| l.entry.view_id == view_id)
                .map(|l| {
                    l.host = new_host(app, &l.entry);
                    l.titles.document = None;
                    l.bar_title()
                });
            if let Some(shown) = shown {
                refresh_title(app, view_id, &shown);
            }
            true
        }
        Navigation::External => {
            hand_off(app, view_id, target);
            false
        }
        Navigation::Block => false,
    }
}

fn hand_off(app: &AppHandle, view_id: &str, target: &Url) {
    let sub = host_state(app);
    let allowed = lock(&sub.live)
        .as_mut()
        .filter(|l| l.entry.view_id == view_id)
        .is_some_and(|l| l.hand_offs.allow(now_ms()));
    if !allowed {
        logs::shell("mini-app link hand-off dropped: too many in a row");
        return;
    }
    if let Err(error) = app.opener().open_url(target.as_str(), None::<&str>) {
        logs::shell(&format!("mini-app link hand-off failed: {error}"));
    }
}

fn isolate_storage<'a, R: tauri::Runtime, M: Manager<R>>(
    app: &AppHandle,
    builder: WebviewWindowBuilder<'a, R, M>,
    origin: &str,
) -> WebviewWindowBuilder<'a, R, M> {
    let Some(running) = app.try_state::<Arc<Running>>() else {
        return builder;
    };
    let profile = uuid::Uuid::from_bytes(running.paths.store_identifier());
    let store = uuid::Uuid::new_v5(&profile, origin.as_bytes());
    #[cfg(target_os = "macos")]
    {
        builder.data_store_identifier(*store.as_bytes())
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder.data_directory(
            running
                .paths
                .root()
                .join("subview")
                .join(store.simple().to_string()),
        )
    }
}

fn build_window(
    app: &AppHandle,
    entry: &Entry,
    display: Display,
    title: &str,
) -> Result<WebviewWindow, String> {
    let label = label_of(&entry.view_id);
    let url: Url = entry
        .url
        .parse()
        .map_err(|e: url::ParseError| e.to_string())?;
    let context = page::context(entry, "", "", false);
    let script = page::page_script(&entry.origin, &context);
    app.add_capability(
        CapabilityBuilder::new(format!("sub-view-{}", entry.view_id))
            .remote(format!("{}/*", entry.origin))
            .window(&label)
            .permission("allow-sub-bridge-request")
            .permission("allow-sub-close-request"),
    )
    .map_err(|e| e.to_string())?;

    let view_id = entry.view_id.clone();
    let origin = entry.origin.clone();
    let nav_app = app.clone();
    let (nav_id, nav_origin) = (view_id.clone(), origin.clone());
    let popup_app = app.clone();
    let (popup_id, popup_origin) = (view_id.clone(), origin.clone());
    let title_app = app.clone();
    let title_id = view_id.clone();

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title(title)
        .inner_size(960.0, 720.0)
        .decorations(display == Display::Titled)
        .initialization_script(script)
        .on_navigation(move |target| on_navigate(&nav_app, &nav_id, &nav_origin, target))
        .on_new_window(move |target, _features| {
            match decide_navigation(target.as_str(), &popup_origin) {
                Navigation::Load => {
                    if let Some(window) = popup_app.get_webview_window(&label_of(&popup_id)) {
                        let _ = window.navigate(target);
                    }
                }
                Navigation::External => hand_off(&popup_app, &popup_id, &target),
                Navigation::Block => {}
            }
            NewWindowResponse::Deny
        })
        .on_download(|_, _| false)
        .on_document_title_changed(move |_window, document| {
            let sub = host_state(&title_app);
            let shown = lock(&sub.live)
                .as_mut()
                .filter(|l| l.entry.view_id == title_id)
                .map(|l| {
                    l.titles.document = Some(document);
                    l.bar_title()
                });
            if let Some(shown) = shown {
                refresh_title(&title_app, &title_id, &shown);
            }
        });
    builder = isolate_storage(app, builder, &origin);
    if let Some(main) = app.get_webview_window("main") {
        builder = builder.parent(&main).map_err(|e| e.to_string())?;
    }
    let window = builder.build().map_err(|e| e.to_string())?;

    let handle = app.clone();
    let watched = view_id;
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let sub = host_state(&handle);
            if sub.views.closed(&watched) {
                *lock(&sub.live) = None;
                closed_event(&handle, &watched, "user", None);
            }
        }
    });
    Ok(window)
}

async fn show(app: AppHandle, entry: Entry) {
    let manifest = if policy::fetches_manifest(entry.trust) {
        fetch_manifest(&entry.origin)
            .await
            .map(|json| policy::read_manifest(&json))
            .unwrap_or_default()
    } else {
        Manifest::default()
    };
    let sub = host_state(&app);
    let shown = {
        let mut live = lock(&sub.live);
        match live.as_mut().filter(|l| l.entry.view_id == entry.view_id) {
            Some(l) => {
                l.display = policy::display_of(entry.trust, &manifest);
                l.titles.manifest_name = manifest.name.clone();
                (l.display, l.bar_title())
            }
            None => return,
        }
    };
    match build_window(&app, &entry, shown.0, &shown.1) {
        Ok(_) => {
            if sub
                .views
                .current()
                .is_none_or(|c| c.view_id != entry.view_id)
            {
                destroy_window(&app, &entry.view_id);
            }
        }
        Err(error) => {
            logs::shell(&format!("mini-app window failed: {error}"));
            abort_view(&app, &entry.view_id);
        }
    }
}

pub fn open_view(app: &AppHandle, request: &OpenRequest, dev: bool) -> Result<Entry, Refusal> {
    let sub = host_state(app);
    let entry = sub.views.open(request, dev)?;
    *lock(&sub.live) = Some(Live {
        host: new_host(app, &entry),
        entry: entry.clone(),
        titles: Titles::default(),
        display: Display::Titled,
        hand_offs: HandOffs::default(),
    });
    tauri::async_runtime::spawn(show(app.clone(), entry.clone()));
    Ok(entry)
}

pub fn open_source(
    app: &AppHandle,
    source: &str,
    port: Option<u16>,
) -> Result<(Entry, Option<u16>), String> {
    let (url, served_port) = match AppSource::parse(source)? {
        AppSource::Default => return Err("a mini-app needs a folder or a URL".to_string()),
        AppSource::Url(url) => (url, None),
        AppSource::Folder(folder) => {
            let sub = host_state(app);
            let known = lock(&sub.served).get(&folder).copied();
            let served = match known {
                Some(port) => (format!("http://localhost:{port}/"), port),
                None => {
                    let served = serve(&folder, port).map_err(|e| e.to_string())?;
                    lock(&sub.served).insert(folder, served.port);
                    (served.url, served.port)
                }
            };
            (served.0, Some(served.1))
        }
    };
    let request = parse_dev(&url).map_err(|r| r.message().to_string())?;
    let entry = open_view(app, &request, true).map_err(|r| r.message().to_string())?;
    Ok((entry, served_port))
}

pub struct PendingMini {
    source: Mutex<Option<String>>,
    port: Option<u16>,
    config: PathBuf,
}

impl PendingMini {
    pub fn new(source: Option<String>, port: Option<u16>, config: PathBuf) -> Self {
        Self {
            source: Mutex::new(source),
            port,
            config,
        }
    }
}

pub fn open_pending_mini(app: &AppHandle, loaded: &Url) {
    let (Some(pending), Some(running)) = (
        app.try_state::<PendingMini>(),
        app.try_state::<Arc<Running>>(),
    ) else {
        return;
    };
    if crate::bridge::origin_of(&running.web_url) != crate::bridge::origin_of(loaded.as_str()) {
        return;
    }
    let Some(source) = lock(&pending.source).take() else {
        return;
    };
    match open_source(app, &source, pending.port) {
        Ok((entry, port)) => {
            logs::shell(&format!("mini-app {} opened from {source}", entry.view_id));
            if port.is_some() && port != pending.port {
                let mut config = crate::app_source::AppConfig::load(&pending.config);
                config.mini_port = port;
                let _ = config.save(&pending.config);
            }
        }
        Err(error) => logs::shell(&format!("mini-app {source} not opened: {error}")),
    }
}

pub fn list_views(app: &AppHandle) -> Vec<Value> {
    host_state(app)
        .views
        .list()
        .iter()
        .map(entry_json)
        .collect()
}

pub fn close_by_host(app: &AppHandle, view_id: Option<&str>) -> Result<(), Refusal> {
    close_view(app, view_id, "host", None)
}

fn open(app: &AppHandle, message: &Value) -> Value {
    let request = match parse_open(&message["data"]) {
        Ok(request) => request,
        Err(refusal) => return refused("OnOpenSubWebView", refusal),
    };
    match open_view(app, &request, false) {
        Ok(entry) => json!({
            "type": "OnOpenSubWebView",
            "success": true,
            "data": { "viewId": entry.view_id },
        }),
        Err(refusal) => refused("OnOpenSubWebView", refusal),
    }
}

fn close(app: &AppHandle, message: &Value) -> Value {
    match close_by_host(app, message["data"]["viewId"].as_str()) {
        Ok(()) => json!({ "type": "OnCloseSubWebView", "success": true, "data": {} }),
        Err(refusal) => refused("OnCloseSubWebView", refusal),
    }
}

pub fn register(host: &mut bridge_host::BridgeHost, context: &Context) {
    context.app.manage(Arc::new(SubHost {
        views: subview::Views::default(),
        live: Mutex::new(None),
        served: Mutex::new(HashMap::new()),
    }));

    let app = context.app.clone();
    host.register("OpenSubWebView", sync(move |message| open(&app, &message)));

    let app = context.app.clone();
    host.register(
        "CloseSubWebView",
        sync(move |message| close(&app, &message)),
    );
}

fn caller(webview: &Webview, sub: &SubHost) -> Result<(Entry, Arc<BridgeHost>), String> {
    let url = webview.url().map_err(|e| e.to_string())?;
    let live = lock(&sub.live);
    let live = live.as_ref().ok_or("no mini-app is showing")?;
    if webview.label() != label_of(&live.entry.view_id)
        || !policy::accepts_message(Some(url.as_str()), true, &live.entry.origin)
    {
        return Err("the caller is not the mini-app".to_string());
    }
    Ok((live.entry.clone(), Arc::clone(&live.host)))
}

#[tauri::command]
pub async fn sub_bridge_request(
    webview: Webview,
    sub: State<'_, Arc<SubHost>>,
    message: String,
) -> Result<(), String> {
    let (_, host) = caller(&webview, &sub)?;
    host.handle_message(&message).await;
    Ok(())
}

#[tauri::command]
pub fn sub_close_request(webview: Webview, sub: State<'_, Arc<SubHost>>) -> Result<(), String> {
    let (entry, _) = caller(&webview, &sub)?;
    close_view(webview.app_handle(), Some(&entry.view_id), "user", None)
        .map_err(|r| r.message().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_entry_json_names_the_trust_and_the_dev_flag() {
        let request = parse_dev("http://localhost:5100/").expect("request");
        let views = subview::Views::default();
        let entry = views.open(&request, true).expect("open");
        let value = entry_json(&entry);
        assert_eq!(value["trust"], "reviewed");
        assert_eq!(value["dev"], true);
        assert_eq!(value["origin"], "http://localhost:5100");
        assert_eq!(value["viewId"], "sub-1");
    }

    #[tokio::test]
    async fn the_manifest_is_read_from_the_well_known_path_with_a_size_cap() {
        let dir = tempfile::tempdir().expect("dir");
        let root = dir.path().join("app");
        std::fs::create_dir_all(root.join(".well-known")).expect("mkdir");
        std::fs::write(root.join("index.html"), "x").expect("index");
        std::fs::write(
            root.join(".well-known/chatic-app.json"),
            r#"{"manifestVersion":1,"name":"Dev","display":"clean"}"#,
        )
        .expect("manifest");
        let served = serve(&root.canonicalize().expect("root"), None).expect("serve");
        let origin = format!("http://localhost:{}", served.port);
        let json = fetch_manifest(&origin).await.expect("manifest");
        let manifest = policy::read_manifest(&json);
        assert_eq!(manifest.name.as_deref(), Some("Dev"));
        assert_eq!(manifest.display, Some(Display::Clean));

        std::fs::write(
            root.join(".well-known/chatic-app.json"),
            format!("{{\"name\":\"{}\"}}", "x".repeat(MANIFEST_LIMIT)),
        )
        .expect("big");
        assert!(fetch_manifest(&origin).await.is_none());
        std::fs::remove_file(root.join(".well-known/chatic-app.json")).expect("rm");
        assert!(fetch_manifest(&origin).await.is_none());
    }
}
