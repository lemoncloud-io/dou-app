use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use dou_auth::{Profile, RelayApi, TokenView, refresh_relay};
use dou_control::{Client, Service, arc, control_name, serve};
use dou_engine::Engine;
use dou_socket::{Link, open_session};
use dou_store::Store;

const DEVICE_NAME: &str = "DoU Desktop (native)";
const RENEW_EVERY: Duration = Duration::from_secs(20 * 60);
const FIRST_CONNECT: Duration = Duration::from_secs(30);

pub fn settings_path(profile_dir: &Path) -> PathBuf {
    profile_dir.join("settings.json")
}

pub struct Running {
    pub me: String,
    pub cloud: String,
    pub control_name: String,
    pub mcp_name: String,
    pub service: Arc<Service<Link>>,
}

impl Running {
    pub async fn serve(&self) -> Result<(), String> {
        let owner = serve(&self.control_name, Arc::clone(&self.service), Client::Cli);
        let mcp = serve(&self.mcp_name, Arc::clone(&self.service), Client::Mcp);
        tokio::select! {
            result = owner => result.map_err(|e| e.to_string()),
            result = mcp => result.map_err(|e| e.to_string()),
        }
    }
}

pub async fn start(
    api: RelayApi,
    profile: &Profile,
    cloud: &str,
    user_agent: &str,
) -> Result<Running, String> {
    let device_id = profile.device_id().map_err(|e| e.to_string())?;
    let session = profile
        .load_relay_token()
        .map_err(|e| e.to_string())?
        .ok_or("not signed in: pair or log in first")?;
    let session = match refresh_relay(api.endpoints(), user_agent, &device_id, &session).await {
        Ok(renewed) => {
            let _ = profile.save_relay_token(&renewed);
            renewed
        }
        Err(error) => {
            eprintln!("relay credential renewal failed ({error}); using the stored one");
            session
        }
    };
    let held = Arc::new(Mutex::new(session));

    spawn_renewal(
        api.clone(),
        Arc::clone(&held),
        profile.dir().to_path_buf(),
        device_id.clone(),
        user_agent.to_string(),
    );

    let user_agent = user_agent.to_string();
    let cloud_id = cloud.to_string();
    let connect_held = Arc::clone(&held);
    let link = Link::start(move || {
        let api = api.clone();
        let cloud = cloud_id.clone();
        let held = Arc::clone(&connect_held);
        let device_id = device_id.clone();
        let user_agent = user_agent.clone();
        async move {
            let session = current(&held)
                .ok_or_else(|| dou_core::Error::Storage("session lock poisoned".into()))?;
            let delegation = api.delegate_cloud(&session, &cloud).await?;
            let cloud_token = api.exchange_token(&session, &delegation).await?;
            let identity = cloud_token
                .identity_token()
                .ok_or(dou_core::Error::MissingField("identityToken"))?;
            open_session(
                &delegation.wss,
                &user_agent,
                identity,
                &device_id,
                DEVICE_NAME,
            )
            .await
        }
    });
    let state = link
        .wait_connected(FIRST_CONNECT)
        .await
        .map_err(|e| format!("could not connect to cloud {cloud}: {e}"))?;
    let me = state["memberId"]
        .as_str()
        .ok_or("auth.update answered no memberId")?
        .to_string();

    let store = Arc::new(Store::open(&profile.dir().join("dou.db")).map_err(|e| e.to_string())?);
    let engine = Engine::new(link.clone(), store, cloud, &me);
    let _ = engine.rooms().await;
    let service = arc(Service::new(engine, settings_path(profile.dir())));
    let pump = Arc::clone(&service);
    let events = link.subscribe();
    tokio::spawn(async move { pump.pump(events).await });

    Ok(Running {
        me,
        cloud: cloud.to_string(),
        control_name: control_name(profile.dir(), Client::Cli),
        mcp_name: control_name(profile.dir(), Client::Mcp),
        service,
    })
}

fn current(held: &Mutex<TokenView>) -> Option<TokenView> {
    held.lock().ok().map(|guard| guard.clone())
}

fn spawn_renewal(
    api: RelayApi,
    held: Arc<Mutex<TokenView>>,
    profile_dir: PathBuf,
    device_id: String,
    user_agent: String,
) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(RENEW_EVERY).await;
            let Some(stored) = current(&held) else {
                continue;
            };
            let Ok(renewed) =
                refresh_relay(api.endpoints(), &user_agent, &device_id, &stored).await
            else {
                eprintln!("relay credential renewal failed; will retry");
                continue;
            };
            if let Ok(profile) = Profile::open(&profile_dir) {
                let _ = profile.save_relay_token(&renewed);
            }
            if let Ok(mut guard) = held.lock() {
                *guard = renewed;
            }
        }
    });
}
