use std::time::Duration;

use dou_auth::{Endpoints, PairingPhase, PairingRequest, Profile, RelayApi};
use dou_http::HttpClient;

use crate::args::{Invocation, USAGE};

const USER_AGENT: &str = concat!("DoU-Desktop-Native/", env!("CARGO_PKG_VERSION"));

fn fail<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

fn endpoints(invocation: &Invocation) -> Result<Endpoints, String> {
    let path = invocation.env_file().ok_or(
        "pass --env-file FILE (or set DOU_ENV_FILE) with VITE_DOU_ENDPOINT and VITE_WS_ENDPOINT",
    )?;
    let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    Endpoints::from_env_file(&text)
        .ok_or_else(|| "env file lacks VITE_DOU_ENDPOINT or VITE_WS_ENDPOINT".to_string())
}

async fn relay_session(api: &RelayApi, profile: &Profile) -> Result<dou_auth::TokenView, String> {
    if let Some(existing) = profile.load_relay_token().map_err(fail)? {
        return Ok(existing);
    }
    let device_id = profile.device_id().map_err(fail)?;
    let view = api.register_device(&device_id).await.map_err(fail)?;
    Ok(view)
}

pub async fn run(invocation: Invocation) -> Result<(), String> {
    let profile = Profile::open(invocation.profile_dir()).map_err(fail)?;
    let api = RelayApi::new(
        HttpClient::new(USER_AGENT).map_err(fail)?,
        endpoints(&invocation)?,
    );
    match invocation.command.as_str() {
        "pair" => pair(&api, &profile).await,
        "login-password" => login_password(&invocation, &api, &profile).await,
        "approve" => approve(&invocation, &api, &profile).await,
        "whoami" => whoami(&profile),
        "clouds" => clouds(&api, &profile).await,
        "probe" => probe(&invocation, &api, &profile).await,
        _ => Err(USAGE.to_string()),
    }
}

async fn pair(api: &RelayApi, profile: &Profile) -> Result<(), String> {
    profile.clear_session().map_err(fail)?;
    let device_id = profile.device_id().map_err(fail)?;
    let device = api.register_device(&device_id).await.map_err(fail)?;
    let request = PairingRequest::start(api, &device, &device_id)
        .await
        .map_err(fail)?;
    let session = request
        .wait(
            api,
            &device,
            |phase| match phase {
                PairingPhase::Waiting { code } => {
                    println!("pairing code: {code} (approve it from a signed-in device)")
                }
                PairingPhase::Applying => println!("approved, signing in"),
            },
            Duration::from_secs(1),
        )
        .await
        .map_err(fail)?;
    profile.save_relay_token(&session).map_err(fail)?;
    println!("signed in as {}", session.user_id().unwrap_or("?"));
    Ok(())
}

async fn login_password(
    invocation: &Invocation,
    api: &RelayApi,
    profile: &Profile,
) -> Result<(), String> {
    let email = invocation
        .rest
        .first()
        .ok_or("login-password needs an EMAIL")?;
    let password = std::env::var("DOU_PASSWORD")
        .map_err(|_| "set DOU_PASSWORD in the environment".to_string())?;
    let session = api.login_password(email, &password).await.map_err(fail)?;
    profile.save_relay_token(&session).map_err(fail)?;
    println!("signed in as {}", session.user_id().unwrap_or("?"));
    Ok(())
}

async fn approve(invocation: &Invocation, api: &RelayApi, profile: &Profile) -> Result<(), String> {
    let code = invocation.rest.first().ok_or("approve needs a CODE")?;
    let session = relay_session(api, profile).await?;
    let check = api.pairing_check(&session, code).await.map_err(fail)?;
    let id = check
        .get("pairingId")
        .and_then(serde_json::Value::as_str)
        .ok_or("check answered no pairingId")?;
    api.pairing_approve(&session, id).await.map_err(fail)?;
    println!("approved");
    Ok(())
}

fn whoami(profile: &Profile) -> Result<(), String> {
    match profile.load_relay_token().map_err(fail)? {
        Some(view) => println!("{}", view.user_id().unwrap_or("?")),
        None => println!("not signed in"),
    }
    Ok(())
}

async fn clouds(api: &RelayApi, profile: &Profile) -> Result<(), String> {
    let session = profile
        .load_relay_token()
        .map_err(fail)?
        .ok_or("not signed in")?;
    let list = api.list_clouds(&session).await.map_err(fail)?;
    println!("{}", serde_json::to_string_pretty(&list).map_err(fail)?);
    Ok(())
}

async fn probe(invocation: &Invocation, api: &RelayApi, profile: &Profile) -> Result<(), String> {
    let cloud = invocation
        .flags
        .get("cloud")
        .ok_or("probe needs --cloud ID")?;
    let ty = invocation.rest.first().ok_or("probe needs a TYPE")?;
    let data: Option<serde_json::Value> = match invocation.rest.get(1) {
        Some(text) => Some(serde_json::from_str(text).map_err(fail)?),
        None => None,
    };
    let session = profile
        .load_relay_token()
        .map_err(fail)?
        .ok_or("not signed in")?;
    let delegation = api.delegate_cloud(&session, cloud).await.map_err(fail)?;
    let cloud_token = api
        .exchange_token(&session, &delegation)
        .await
        .map_err(fail)?;
    let identity = cloud_token
        .identity_token()
        .ok_or("cloud token has no identity token")?;
    let device_id = profile.device_id().map_err(fail)?;
    let open = dou_socket::open_session(
        &delegation.wss,
        USER_AGENT,
        identity,
        &device_id,
        "DoU Desktop (native)",
    )
    .await
    .map_err(fail)?;
    eprintln!("auth.update: {}", open.state);
    let answer = open
        .socket
        .request(ty, data.as_ref(), None)
        .await
        .map_err(fail)?;
    println!("{}", serde_json::to_string_pretty(&answer).map_err(fail)?);
    Ok(())
}
