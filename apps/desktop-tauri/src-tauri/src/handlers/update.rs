use std::sync::{Arc, Mutex};
use std::time::Duration;

use bridge_host::BridgeHost;
use serde_json::{Value, json};
use tauri::AppHandle;
use tauri_plugin_updater::{Update, UpdaterExt};

use super::{Context, sync};
use crate::bridge::push_event;

const CHECK_EVERY: Duration = Duration::from_secs(30 * 60);

#[derive(Default)]
struct State {
    found: Option<Update>,
    bytes: Option<Vec<u8>>,
    busy: bool,
}

pub fn percent(received: u64, total: Option<u64>) -> u8 {
    match total {
        Some(total) if total > 0 => (received.saturating_mul(100) / total).min(100) as u8,
        _ => 0,
    }
}

fn status(app: &AppHandle, data: Value) {
    push_event(app, "OnUpdateStatus", data);
}

fn lock(state: &Mutex<State>) -> std::sync::MutexGuard<'_, State> {
    state.lock().unwrap_or_else(|e| e.into_inner())
}

async fn check(app: &AppHandle, feed: &str, state: &Mutex<State>) {
    if lock(state).busy {
        return;
    }
    let Ok(url) = feed.parse() else {
        return;
    };
    let checked = match app.updater_builder().endpoints(vec![url]) {
        Ok(builder) => match builder.build() {
            Ok(updater) => updater.check().await,
            Err(error) => Err(error),
        },
        Err(error) => Err(error),
    };
    match checked {
        Ok(Some(update)) => {
            let version = update.version.clone();
            lock(state).found = Some(update);
            status(app, json!({ "status": "available", "version": version }));
        }
        Ok(None) => {}
        Err(error) => eprintln!("update check failed: {error}"),
    }
}

async fn download(app: AppHandle, state: Arc<Mutex<State>>) {
    let Some(update) = lock(&state).found.clone() else {
        lock(&state).busy = false;
        return;
    };
    let mut received: u64 = 0;
    let mut last = 255u8;
    let progress_app = app.clone();
    let result = update
        .download(
            |chunk, total| {
                received += chunk as u64;
                let now = percent(received, total);
                if now != last {
                    last = now;
                    status(
                        &progress_app,
                        json!({ "status": "downloading", "percent": now }),
                    );
                }
            },
            || {},
        )
        .await;
    match result {
        Ok(bytes) => {
            lock(&state).bytes = Some(bytes);
            status(
                &app,
                json!({ "status": "downloaded", "version": update.version }),
            );
        }
        Err(error) => {
            lock(&state).busy = false;
            status(
                &app,
                json!({ "status": "error", "message": error.to_string() }),
            );
        }
    }
}

pub fn register(host: &mut BridgeHost, context: &Context) {
    let state = Arc::new(Mutex::new(State::default()));

    if let Some(feed) = option_env!("DOU_UPDATE_FEED") {
        let app = context.app.clone();
        let state = Arc::clone(&state);
        tauri::async_runtime::spawn(async move {
            loop {
                check(&app, feed, &state).await;
                tokio::time::sleep(CHECK_EVERY).await;
            }
        });
    }

    let app = context.app.clone();
    let shared = Arc::clone(&state);
    host.register(
        "StartUpdateDownload",
        sync(move |_| {
            let started = {
                let mut state = lock(&shared);
                let startable = state.found.is_some() && !state.busy;
                if startable {
                    state.busy = true;
                }
                startable
            };
            if started {
                tauri::async_runtime::spawn(download(app.clone(), Arc::clone(&shared)));
            }
            json!({ "type": "OnStartUpdateDownload", "success": true, "data": { "success": started } })
        }),
    );

    let app = context.app.clone();
    host.register(
        "RestartToUpdate",
        sync(move |_| {
            let ready = {
                let mut state = lock(&state);
                state.found.clone().zip(state.bytes.take())
            };
            let restarting = ready.is_some();
            if let Some((update, bytes)) = ready {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    match update.install(bytes) {
                        Ok(()) => app.restart(),
                        Err(error) => status(
                            &app,
                            json!({ "status": "error", "message": error.to_string() }),
                        ),
                    }
                });
            }
            json!({ "type": "OnRestartToUpdate", "success": true, "data": { "success": restarting } })
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_is_a_whole_percent_and_never_past_one_hundred() {
        assert_eq!(percent(0, Some(200)), 0);
        assert_eq!(percent(50, Some(200)), 25);
        assert_eq!(percent(400, Some(200)), 100);
        assert_eq!(percent(10, None), 0);
        assert_eq!(percent(10, Some(0)), 0);
    }
}
