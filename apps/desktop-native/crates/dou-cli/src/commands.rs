use std::path::Path;
use std::time::Duration;

use dou_auth::{
    Endpoints, PairingPhase, PairingRequest, Profile, RelayApi, TokenView, refresh_relay,
};
use dou_control::{Client, Settings, Tier, control_name};
use dou_http::HttpClient;
use serde_json::{Value, json};

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

fn session_of(profile: &Profile) -> Result<TokenView, String> {
    profile
        .load_relay_token()
        .map_err(fail)?
        .ok_or_else(|| "not signed in: run 'dou pair' or 'dou login-password' first".to_string())
}

fn settings_path(profile: &Profile) -> std::path::PathBuf {
    dou_app::settings_path(profile.dir())
}

fn print(value: &Value) -> Result<(), String> {
    println!("{}", serde_json::to_string_pretty(value).map_err(fail)?);
    Ok(())
}

pub async fn run(invocation: Invocation) -> Result<(), String> {
    let profile = Profile::open(invocation.profile_dir()).map_err(fail)?;
    match invocation.command.as_str() {
        "whoami" => return whoami(&profile),
        "perm" => return perm(&invocation, &profile),
        "mcp" => {
            let name = control_name(profile.dir(), Client::Mcp);
            return dou_mcp::run(tokio::io::stdin(), tokio::io::stdout(), name)
                .await
                .map_err(fail);
        }
        "rooms" | "read" | "send" | "reply" | "react" | "mention" | "events" | "wait" => {
            return local(&invocation, &profile).await;
        }
        _ => {}
    }
    let api = RelayApi::new(
        HttpClient::new(USER_AGENT).map_err(fail)?,
        endpoints(&invocation)?,
    );
    match invocation.command.as_str() {
        "pair" => pair(&api, &profile).await,
        "login-password" => login_password(&invocation, &api, &profile).await,
        "approve" => approve(&invocation, &api, &profile).await,
        "refresh" => refresh(&api, &profile).await,
        "clouds" => clouds(&api, &profile).await,
        "serve" => serve_app(&invocation, api, profile).await,
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
                    println!("pairing code: {code} (approve it from a signed-in device)");
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
    let session = session_of(profile)?;
    let check = api.pairing_check(&session, code).await.map_err(fail)?;
    let id = check
        .get("pairingId")
        .and_then(Value::as_str)
        .ok_or("check answered no pairingId")?;
    api.pairing_approve(&session, id).await.map_err(fail)?;
    println!("approved");
    Ok(())
}

async fn refresh(api: &RelayApi, profile: &Profile) -> Result<(), String> {
    let stored = session_of(profile)?;
    let device_id = profile.device_id().map_err(fail)?;
    let renewed = refresh_relay(api.endpoints(), USER_AGENT, &device_id, &stored)
        .await
        .map_err(fail)?;
    profile.save_relay_token(&renewed).map_err(fail)?;
    println!("relay credential renewed");
    Ok(())
}

async fn clouds(api: &RelayApi, profile: &Profile) -> Result<(), String> {
    let list = api.list_clouds(&session_of(profile)?).await.map_err(fail)?;
    let rows: Vec<Value> = list["list"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|c| json!({ "id": c["id"], "name": c["name"], "isOwner": c["isOwner"] }))
                .collect()
        })
        .unwrap_or_default();
    print(&json!({ "list": rows }))
}

fn whoami(profile: &Profile) -> Result<(), String> {
    match profile.load_relay_token().map_err(fail)? {
        Some(view) => println!("{}", view.user_id().unwrap_or("?")),
        None => println!("not signed in"),
    }
    Ok(())
}

async fn serve_app(invocation: &Invocation, api: RelayApi, profile: Profile) -> Result<(), String> {
    let cloud = invocation
        .flags
        .get("cloud")
        .ok_or("serve needs --cloud ID")?;
    let running = dou_app::start(api, &profile, cloud, USER_AGENT).await?;
    eprintln!(
        "serving cloud {} as member {}; control endpoint {}",
        running.cloud, running.me, running.control_name
    );
    running.serve().await
}

async fn local(invocation: &Invocation, profile: &Profile) -> Result<(), String> {
    let name = control_name(profile.dir(), Client::Cli);
    let arg = |index: usize, what: &str| -> Result<&String, String> {
        invocation
            .rest
            .get(index)
            .ok_or_else(|| format!("{} needs {what}", invocation.command))
    };
    let number =
        |flag: &str| -> Option<i64> { invocation.flags.get(flag).and_then(|v| v.parse().ok()) };
    let (method, params) = match invocation.command.as_str() {
        "rooms" => ("rooms", json!({})),
        "read" => (
            "messages",
            json!({ "channelId": arg(0, "a ROOM")?, "limit": number("limit").unwrap_or(20) }),
        ),
        "send" => (
            "send",
            json!({ "channelId": arg(0, "a ROOM")?, "text": arg(1, "TEXT")? }),
        ),
        "reply" => (
            "reply",
            json!({ "channelId": arg(0, "a ROOM")?, "parentId": arg(1, "a PARENT_ID")?, "text": arg(2, "TEXT")? }),
        ),
        "react" => (
            "react",
            json!({
                "channelId": arg(0, "a ROOM")?, "chatId": arg(1, "a CHAT_ID")?, "emoji": arg(2, "an EMOJI")?,
                "on": !invocation.flags.contains_key("off"),
            }),
        ),
        "mention" => (
            "mention",
            json!({
                "channelId": arg(0, "a ROOM")?,
                "userIds": arg(1, "USER_IDS")?.split(',').collect::<Vec<_>>(),
                "text": arg(2, "TEXT")?,
            }),
        ),
        "events" => (
            "events_list",
            json!({ "since": number("since").unwrap_or(0) }),
        ),
        "wait" => (
            "events_wait",
            json!({ "since": number("since").unwrap_or(0), "timeoutMs": number("timeout").unwrap_or(30_000) }),
        ),
        _ => return Err(USAGE.to_string()),
    };
    match dou_control::call(&name, method, params).await {
        Ok(Ok(result)) => print(&result),
        Ok(Err(error)) => Err(format!("{}: {}", error["code"], error["message"])),
        Err(error) => Err(format!("is 'dou serve' running for this profile? {error}")),
    }
}

fn perm(invocation: &Invocation, profile: &Profile) -> Result<(), String> {
    let path = settings_path(profile);
    let mut settings = Settings::load(&path);
    let rest: Vec<&str> = invocation.rest.iter().map(String::as_str).collect();
    match rest.as_slice() {
        ["show"] | [] => {}
        ["tier", value] => {
            settings.tier = Tier::parse(value).ok_or("tier is off, read, write or full")?
        }
        ["allow", room] => {
            if !settings.allows_room(room) {
                settings.allow_rooms.push((*room).to_string());
            }
        }
        ["deny", room] => settings.allow_rooms.retain(|existing| existing != room),
        ["rate", per_minute, per_hour] => {
            settings.rate_limit.per_minute = per_minute.parse().map_err(fail)?;
            settings.rate_limit.per_hour = per_hour.parse().map_err(fail)?;
        }
        _ => return Err(USAGE.to_string()),
    }
    if rest.first().is_some_and(|word| *word != "show") {
        settings.save(Path::new(&path)).map_err(fail)?;
    }
    print(&serde_json::to_value(&settings).map_err(fail)?)
}
