use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use dou_auth::{Endpoints, PairingPhase, PairingRequest, Profile, RelayApi};
use dou_control::{Client, Service};
use dou_http::HttpClient;
use dou_socket::Link;
use serde_json::{Value, json};
use tauri::{App, Manager};

use super::config::{AgentConfig, endpoints_for, profile_dir_in};

pub const USER_AGENT: &str = concat!("DoU-Tauri/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Engine {
    Stopped,
    Starting { cloud: String },
    Running { cloud: String, me: String },
    Failed { message: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Pairing {
    Idle,
    Starting,
    Waiting { code: String },
    Applying,
    Failed { message: String },
}

pub struct Agent {
    profile_dir: PathBuf,
    endpoints: Endpoints,
    engine: Mutex<Engine>,
    pairing: Mutex<Pairing>,
    service: Mutex<Option<Arc<Service<Link>>>>,
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|p| p.into_inner())
}

impl Agent {
    pub fn new(profile_dir: PathBuf, stage: &str) -> Self {
        Self {
            profile_dir,
            endpoints: endpoints_for(stage),
            engine: Mutex::new(Engine::Stopped),
            pairing: Mutex::new(Pairing::Idle),
            service: Mutex::new(None),
        }
    }

    pub fn profile_dir(&self) -> &Path {
        &self.profile_dir
    }

    pub fn engine(&self) -> Engine {
        lock(&self.engine).clone()
    }

    pub fn pairing(&self) -> Pairing {
        lock(&self.pairing).clone()
    }

    pub fn service(&self) -> Option<Arc<Service<Link>>> {
        lock(&self.service).clone()
    }

    fn api(&self) -> Result<RelayApi, String> {
        let http = HttpClient::new(USER_AGENT).map_err(|e| e.to_string())?;
        Ok(RelayApi::new(http, self.endpoints.clone()))
    }

    pub fn signed_in(&self) -> bool {
        Profile::open(&self.profile_dir)
            .ok()
            .and_then(|profile| profile.load_relay_token().ok().flatten())
            .is_some()
    }

    pub fn chosen_cloud(&self) -> Option<String> {
        AgentConfig::load(&self.profile_dir).cloud
    }

    pub fn choose_cloud(&self, cloud: &str) -> Result<(), String> {
        AgentConfig {
            cloud: Some(cloud.to_string()),
        }
        .save(&self.profile_dir)
        .map_err(|e| e.to_string())
    }

    pub fn start_pairing(self: &Arc<Self>) -> Result<(), String> {
        if matches!(
            self.pairing(),
            Pairing::Starting | Pairing::Waiting { .. } | Pairing::Applying
        ) {
            return Ok(());
        }
        *lock(&self.pairing) = Pairing::Starting;
        let agent = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let outcome = agent.pair().await;
            *lock(&agent.pairing) = match outcome {
                Ok(()) => Pairing::Idle,
                Err(message) => Pairing::Failed { message },
            };
            if agent.pairing() == Pairing::Idle {
                agent.autostart_engine();
            }
        });
        Ok(())
    }

    async fn pair(&self) -> Result<(), String> {
        let profile = Profile::open(&self.profile_dir).map_err(|e| e.to_string())?;
        profile.clear_session().map_err(|e| e.to_string())?;
        let device_id = profile.device_id().map_err(|e| e.to_string())?;
        let api = self.api()?;
        let device = api
            .register_device(&device_id)
            .await
            .map_err(|e| e.to_string())?;
        let request = PairingRequest::start(&api, &device, &device_id)
            .await
            .map_err(|e| e.to_string())?;
        let session = request
            .wait(
                &api,
                &device,
                |phase| {
                    *lock(&self.pairing) = match phase {
                        PairingPhase::Waiting { code } => {
                            #[cfg(debug_assertions)]
                            eprintln!("agent pairing code: {code}");
                            Pairing::Waiting { code }
                        }
                        PairingPhase::Applying => Pairing::Applying,
                    };
                },
                Duration::from_secs(1),
            )
            .await
            .map_err(|e| e.to_string())?;
        profile
            .save_relay_token(&session)
            .map_err(|e| e.to_string())
    }

    pub async fn clouds(&self) -> Result<Value, String> {
        let profile = Profile::open(&self.profile_dir).map_err(|e| e.to_string())?;
        let session = profile
            .load_relay_token()
            .map_err(|e| e.to_string())?
            .ok_or("not signed in")?;
        let list = self
            .api()?
            .list_clouds(&session)
            .await
            .map_err(|e| e.to_string())?;
        let rows: Vec<Value> = list["list"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .map(|c| json!({ "id": c["id"], "name": c["name"], "isOwner": c["isOwner"] }))
                    .collect()
            })
            .unwrap_or_default();
        Ok(json!(rows))
    }

    pub fn autostart_engine(self: &Arc<Self>) {
        if !self.signed_in() {
            return;
        }
        let Some(cloud) = self.chosen_cloud() else {
            return;
        };
        if matches!(
            self.engine(),
            Engine::Starting { .. } | Engine::Running { .. }
        ) {
            return;
        }
        let agent = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            if let Err(error) = agent.run(cloud).await {
                eprintln!("agent engine stopped: {error}");
            }
        });
    }

    async fn run(&self, cloud: String) -> Result<(), String> {
        *lock(&self.engine) = Engine::Starting {
            cloud: cloud.clone(),
        };
        let started = async {
            let profile = Profile::open(&self.profile_dir).map_err(|e| e.to_string())?;
            dou_app::start(self.api()?, &profile, &cloud, USER_AGENT).await
        }
        .await;
        let running = match started {
            Ok(running) => running,
            Err(message) => {
                *lock(&self.engine) = Engine::Failed {
                    message: message.clone(),
                };
                return Err(message);
            }
        };
        *lock(&self.service) = Some(Arc::clone(&running.service));
        *lock(&self.engine) = Engine::Running {
            cloud,
            me: running.me.clone(),
        };
        let outcome = running.serve().await;
        *lock(&self.service) = None;
        *lock(&self.engine) = Engine::Failed {
            message: outcome.clone().err().unwrap_or_else(|| "stopped".into()),
        };
        outcome
    }

    pub async fn owner_call(&self, method: &str, params: Value) -> Result<Value, String> {
        let service = self.service().ok_or("the engine is not running")?;
        service
            .handle(Client::Cli, method, params)
            .await
            .map_err(|e| e["message"].as_str().unwrap_or("engine error").to_string())
    }
}

pub fn autostart(app: &App, stage: &str) -> Result<Arc<Agent>, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let agent = Arc::new(Agent::new(profile_dir_in(&app_data), stage));
    app.manage(Arc::clone(&agent));
    agent.autostart_engine();
    if cfg!(debug_assertions)
        && std::env::var_os("DOU_AGENT_AUTOPAIR").is_some()
        && !agent.signed_in()
    {
        agent.start_pairing()?;
    }
    Ok(agent)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_agent_is_stopped_idle_and_not_signed_in() {
        let dir = tempfile::tempdir().expect("temp dir");
        let agent = Agent::new(dir.path().join("agent"), "dev");
        assert_eq!(agent.engine(), Engine::Stopped);
        assert_eq!(agent.pairing(), Pairing::Idle);
        assert!(!agent.signed_in());
        assert_eq!(agent.chosen_cloud(), None);
        assert!(agent.service().is_none());
    }

    #[test]
    fn a_chosen_cloud_is_remembered() {
        let dir = tempfile::tempdir().expect("temp dir");
        let agent = Agent::new(dir.path().join("agent"), "dev");
        agent.choose_cloud("cloud-9").expect("save");
        assert_eq!(agent.chosen_cloud().as_deref(), Some("cloud-9"));
    }
}
