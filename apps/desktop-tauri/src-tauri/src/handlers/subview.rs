use std::sync::Arc;

use bridge_host::BridgeHost;
use serde_json::{Value, json};
use subview::{Refusal, Views, origin_of, parse_open};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use super::{Context, sync};
use crate::bridge::push_event;

fn label_of(view_id: &str) -> String {
    format!("subview-{view_id}")
}

fn refused(response_type: &str, refusal: Refusal) -> Value {
    json!({
        "type": response_type,
        "success": false,
        "error": { "code": refusal.code(), "message": refusal.message() },
    })
}

fn closed_event(app: &AppHandle, view_id: &str, reason: &str) {
    push_event(
        app,
        "OnSubWebViewClosed",
        json!({ "viewId": view_id, "reason": reason }),
    );
}

fn open(app: &AppHandle, views: &Arc<Views>, message: &Value) -> Value {
    let request = match parse_open(&message["data"]) {
        Ok(request) => request,
        Err(refusal) => return refused("OnOpenSubWebView", refusal),
    };
    let Ok(url) = request.url.parse() else {
        return refused("OnOpenSubWebView", Refusal::NotAllowed);
    };
    let view_id = match views.open() {
        Ok(id) => id,
        Err(refusal) => return refused("OnOpenSubWebView", refusal),
    };
    let allowed = request.origin.clone();
    let title = match request.trust {
        subview::Trust::External => request.origin.trim_start_matches("https://").to_string(),
        _ => request
            .title
            .clone()
            .unwrap_or_else(|| request.origin.trim_start_matches("https://").to_string()),
    };
    let built = WebviewWindowBuilder::new(app, label_of(&view_id), WebviewUrl::External(url))
        .title(title)
        .inner_size(960.0, 720.0)
        .on_navigation(move |target| {
            origin_of(target.as_str()).as_deref() == Some(allowed.as_str())
        })
        .build();
    let window = match built {
        Ok(window) => window,
        Err(error) => {
            views.closed(&view_id);
            return json!({
                "type": "OnOpenSubWebView",
                "success": false,
                "error": { "code": "OPEN_FAILED", "message": error.to_string() },
            });
        }
    };
    let handle = app.clone();
    let views = Arc::clone(views);
    let watched = view_id.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) && views.closed(&watched) {
            closed_event(&handle, &watched, "user");
        }
    });
    json!({ "type": "OnOpenSubWebView", "success": true, "data": { "viewId": view_id } })
}

fn close(app: &AppHandle, views: &Views, message: &Value) -> Value {
    match views.close(message["data"]["viewId"].as_str()) {
        Ok(id) => {
            if let Some(window) = app.get_webview_window(&label_of(&id)) {
                let _ = window.destroy();
            }
            closed_event(app, &id, "host");
            json!({ "type": "OnCloseSubWebView", "success": true, "data": {} })
        }
        Err(refusal) => refused("OnCloseSubWebView", refusal),
    }
}

pub fn register(host: &mut BridgeHost, context: &Context) {
    let views = Arc::new(Views::default());

    let app = context.app.clone();
    let open_views = Arc::clone(&views);
    host.register(
        "OpenSubWebView",
        sync(move |message| open(&app, &open_views, &message)),
    );

    let app = context.app.clone();
    host.register(
        "CloseSubWebView",
        sync(move |message| close(&app, &views, &message)),
    );
}
