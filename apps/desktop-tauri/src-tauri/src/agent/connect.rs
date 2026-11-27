use std::path::PathBuf;
use std::sync::Arc;

use connectors::{Launcher, Status};
use serde_json::{Value, json};
use tauri::{AppHandle, Manager, State, Webview};

use super::commands::from_agent_window;
use super::Agent;

fn launcher_for(agent: &Agent) -> Result<Launcher, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let name = if cfg!(windows) {
        "dou-mcp.exe"
    } else {
        "dou-mcp"
    };
    let command = exe.parent().ok_or("the app has no directory")?.join(name);
    Ok(Launcher {
        command,
        profile: agent.profile_dir().to_path_buf(),
    })
}

fn status_value(status: &Status) -> Value {
    match status {
        Status::NotInstalled => json!({ "kind": "not-installed" }),
        Status::NotRegistered => json!({ "kind": "not-registered" }),
        Status::Registered => json!({ "kind": "registered" }),
        Status::Different { command } => json!({ "kind": "different", "command": command }),
        Status::Unreadable { reason } => json!({ "kind": "unreadable", "reason": reason }),
    }
}

struct Places {
    desktop_config: PathBuf,
    claude_json: PathBuf,
    claude: Option<PathBuf>,
}

fn places(app: &AppHandle) -> Result<Places, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let appdata = if cfg!(windows) {
        app.path().data_dir().ok()
    } else {
        None
    };
    let path_var = std::env::var("PATH").unwrap_or_default();
    Ok(Places {
        desktop_config: connectors::claude_desktop_config_path(&home, appdata.as_deref()),
        claude_json: home.join(".claude.json"),
        claude: connectors::find_claude(&path_var, &home),
    })
}

#[tauri::command]
pub fn agent_connectors(
    webview: Webview,
    app: AppHandle,
    agent: State<'_, Arc<Agent>>,
) -> Result<Value, String> {
    from_agent_window(&webview)?;
    let launcher = launcher_for(&agent)?;
    let places = places(&app)?;
    Ok(json!({
        "launcher": {
            "command": launcher.command,
            "profile": launcher.profile,
            "exists": launcher.command.is_file(),
        },
        "desktop": {
            "path": places.desktop_config,
            "status": status_value(&connectors::desktop_status(&places.desktop_config, &launcher)),
        },
        "code": {
            "claude": places.claude,
            "status": status_value(&connectors::claude_code_status(&places.claude_json, &launcher)),
            "command": launcher.claude_command_text(),
        },
    }))
}

#[tauri::command]
pub async fn agent_connect(
    webview: Webview,
    app: AppHandle,
    agent: State<'_, Arc<Agent>>,
    target: String,
) -> Result<String, String> {
    from_agent_window(&webview)?;
    let launcher = launcher_for(&agent)?;
    if !launcher.command.is_file() {
        return Err(format!(
            "The MCP launcher is missing at {}",
            launcher.command.display()
        ));
    }
    let places = places(&app)?;
    match target.as_str() {
        "desktop" => {
            connectors::desktop_register(&places.desktop_config, &launcher)?;
            Ok("Registered with Claude Desktop. Restart Claude Desktop to load it.".to_string())
        }
        "code" => {
            let claude = places
                .claude
                .ok_or("The claude command was not found. Use the copy button instead.")?;
            tauri::async_runtime::spawn_blocking(move || {
                connectors::claude_code_register(&claude, &launcher)
            })
            .await
            .map_err(|e| e.to_string())?
        }
        _ => Err("unknown target".to_string()),
    }
}

#[tauri::command]
pub async fn agent_disconnect(
    webview: Webview,
    app: AppHandle,
    target: String,
) -> Result<String, String> {
    from_agent_window(&webview)?;
    let places = places(&app)?;
    match target.as_str() {
        "desktop" => {
            connectors::desktop_unregister(&places.desktop_config)?;
            Ok("Removed from Claude Desktop.".to_string())
        }
        "code" => {
            let claude = places.claude.ok_or("The claude command was not found.")?;
            tauri::async_runtime::spawn_blocking(move || {
                connectors::claude_code_unregister(&claude)
            })
            .await
            .map_err(|e| e.to_string())?
        }
        _ => Err("unknown target".to_string()),
    }
}