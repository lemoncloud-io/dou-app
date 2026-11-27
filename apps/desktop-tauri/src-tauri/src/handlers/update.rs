use std::sync::{Arc, Mutex};
use std::time::Duration;

use bridge_host::BridgeHost;
use serde_json::{Value, json};
use tauri::AppHandle;
use tauri_plugin_updater::{Update, UpdaterExt};

use super::{Context, sync};
use crate::bridge::push_event;

const CHECK_EVERY: Duration = Duration::from_secs(30 * 60);

struct State<U = Update> {
    found: Option<U>,
    bytes: Option<Vec<u8>>,
    busy: bool,
}

impl<U> Default for State<U> {
    fn default() -> Self {
        Self {
            found: None,
            bytes: None,
            busy: false,
        }
    }
}

impl<U: Clone> State<U> {
    fn offer(&mut self, update: U) -> bool {
        if self.busy {
            return false;
        }
        self.found = Some(update);
        true
    }

    fn begin_download(&mut self) -> Option<U> {
        if self.busy {
            return None;
        }
        let update = self.found.clone()?;
        self.busy = true;
        Some(update)
    }

    fn downloaded(&mut self, bytes: Vec<u8>) {
        self.bytes = Some(bytes);
    }

    fn take_ready(&mut self) -> Option<(U, Vec<u8>)> {
        let bytes = self.bytes.take()?;
        let update = self.found.clone()?;
        Some((update, bytes))
    }

    fn fail(&mut self) {
        self.found = None;
        self.bytes = None;
        self.busy = false;
    }
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
            if lock(state).offer(update) {
                status(app, json!({ "status": "available", "version": version }));
            }
        }
        Ok(None) => {}
        Err(error) => crate::logs::shell(&format!("update check failed: {error}")),
    }
}

async fn download(app: AppHandle, state: Arc<Mutex<State>>, update: Update) {
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
            lock(&state).downloaded(bytes);
            status(
                &app,
                json!({ "status": "downloaded", "version": update.version }),
            );
        }
        Err(error) => {
            lock(&state).fail();
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
            let begun = lock(&shared).begin_download();
            let started = begun.is_some();
            if let Some(update) = begun {
                tauri::async_runtime::spawn(download(app.clone(), Arc::clone(&shared), update));
            }
            json!({ "type": "OnStartUpdateDownload", "success": true, "data": { "success": started } })
        }),
    );

    let app = context.app.clone();
    host.register(
        "RestartToUpdate",
        sync(move |_| {
            let ready = lock(&state).take_ready();
            let restarting = ready.is_some();
            if let Some((update, bytes)) = ready {
                let app = app.clone();
                let state = Arc::clone(&state);
                tauri::async_runtime::spawn(async move {
                    let installed =
                        tauri::async_runtime::spawn_blocking(move || update.install(bytes)).await;
                    match installed {
                        Ok(Ok(())) => app.restart(),
                        Ok(Err(error)) => {
                            lock(&state).fail();
                            status(
                                &app,
                                json!({ "status": "error", "message": error.to_string() }),
                            );
                        }
                        Err(error) => {
                            lock(&state).fail();
                            status(
                                &app,
                                json!({ "status": "error", "message": error.to_string() }),
                            );
                        }
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

    #[test]
    fn a_download_starts_once_and_only_for_an_offered_update() {
        let mut state = State::<u32>::default();
        assert_eq!(state.begin_download(), None);
        assert!(state.offer(2));
        assert_eq!(state.begin_download(), Some(2));
        assert_eq!(state.begin_download(), None);
    }

    #[test]
    fn a_new_offer_is_refused_while_a_download_runs() {
        let mut state = State::<u32>::default();
        state.offer(2);
        state.begin_download();
        assert!(!state.offer(3));
        assert_eq!(state.found, Some(2));
    }

    #[test]
    fn restart_needs_the_downloaded_bytes_and_uses_them_once() {
        let mut state = State::<u32>::default();
        state.offer(2);
        assert_eq!(state.take_ready(), None);
        state.begin_download();
        state.downloaded(vec![1, 2]);
        assert_eq!(state.take_ready(), Some((2, vec![1, 2])));
        assert_eq!(state.take_ready(), None);
    }

    #[test]
    fn after_a_failure_the_next_check_and_download_can_start_over() {
        let mut state = State::<u32>::default();
        state.offer(2);
        state.begin_download();
        state.downloaded(vec![9]);
        state.take_ready();
        state.fail();
        assert!(state.offer(2));
        assert_eq!(state.begin_download(), Some(2));
    }
}
