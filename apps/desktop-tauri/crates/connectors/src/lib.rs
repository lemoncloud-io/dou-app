use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde_json::{Map, Value, json};

pub const SERVER_NAME: &str = "dou";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Launcher {
    pub command: PathBuf,
    pub profile: PathBuf,
}

impl Launcher {
    pub fn args(&self) -> Vec<String> {
        vec![
            "--profile".to_string(),
            self.profile.to_string_lossy().into_owned(),
        ]
    }

    fn entry(&self) -> Value {
        json!({ "command": self.command.to_string_lossy(), "args": self.args() })
    }

    pub fn claude_add_args(&self) -> Vec<String> {
        let mut args: Vec<String> = ["mcp", "add", "--scope", "user", SERVER_NAME, "--"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        args.push(self.command.to_string_lossy().into_owned());
        args.extend(self.args());
        args
    }

    pub fn claude_command_text(&self) -> String {
        let quote = |s: &str| format!("'{}'", s.replace('\'', "'\\''"));
        let parts: Vec<String> = self.claude_add_args().iter().map(|a| quote(a)).collect();
        format!("claude {}", parts.join(" "))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Status {
    NotInstalled,
    NotRegistered,
    Registered,
    Different { command: String },
    Unreadable { reason: String },
}

pub fn claude_desktop_config_path(home: &Path, appdata: Option<&Path>) -> PathBuf {
    if let Some(appdata) = appdata {
        return appdata.join("Claude").join("claude_desktop_config.json");
    }
    home.join("Library")
        .join("Application Support")
        .join("Claude")
        .join("claude_desktop_config.json")
}

fn same_entry(entry: &Value, launcher: &Launcher) -> Result<(), String> {
    let command = entry["command"].as_str().unwrap_or_default();
    let args_match = entry["args"] == json!(launcher.args());
    if command == launcher.command.to_string_lossy() && args_match {
        Ok(())
    } else {
        Err(command.to_string())
    }
}

fn status_of_servers(servers: Option<&Value>, launcher: &Launcher) -> Status {
    match servers.and_then(|s| s.get(SERVER_NAME)) {
        None => Status::NotRegistered,
        Some(entry) => match same_entry(entry, launcher) {
            Ok(()) => Status::Registered,
            Err(command) => Status::Different { command },
        },
    }
}

pub fn desktop_status(config: &Path, launcher: &Launcher) -> Status {
    let Some(dir) = config.parent() else {
        return Status::NotInstalled;
    };
    if !dir.is_dir() {
        return Status::NotInstalled;
    }
    let text = match fs::read_to_string(config) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => return Status::NotRegistered,
        Err(error) => {
            return Status::Unreadable {
                reason: error.to_string(),
            };
        }
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Object(root)) => status_of_servers(root.get("mcpServers"), launcher),
        Ok(_) | Err(_) => Status::Unreadable {
            reason: "the config is not a JSON object".to_string(),
        },
    }
}

fn read_config(config: &Path) -> Result<Map<String, Value>, String> {
    match fs::read_to_string(config) {
        Ok(text) => match serde_json::from_str::<Value>(&text) {
            Ok(Value::Object(root)) => Ok(root),
            _ => Err(
                "the Claude Desktop config is not a JSON object; fix it by hand first".to_string(),
            ),
        },
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Map::new()),
        Err(error) => Err(error.to_string()),
    }
}

fn write_config(config: &Path, root: Map<String, Value>) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&Value::Object(root)).map_err(|e| e.to_string())?;
    let mut temp = config.as_os_str().to_owned();
    temp.push(".dou-tmp");
    let temp = PathBuf::from(temp);
    fs::write(&temp, format!("{text}\n"))
        .and_then(|_| fs::rename(&temp, config))
        .map_err(|e| {
            let _ = fs::remove_file(&temp);
            e.to_string()
        })
}

fn backup_once(config: &Path) -> Result<(), String> {
    if !config.exists() {
        return Ok(());
    }
    let mut backup = config.as_os_str().to_owned();
    backup.push(".dou-backup");
    let backup = PathBuf::from(backup);
    if backup.exists() {
        return Ok(());
    }
    fs::copy(config, backup)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn desktop_register(config: &Path, launcher: &Launcher) -> Result<(), String> {
    let dir = config.parent().ok_or("no config directory")?;
    if !dir.is_dir() {
        return Err("Claude Desktop is not installed (no config directory)".to_string());
    }
    let mut root = read_config(config)?;
    backup_once(config)?;
    let servers = root
        .entry("mcpServers")
        .or_insert_with(|| Value::Object(Map::new()));
    let Value::Object(servers) = servers else {
        return Err("mcpServers in the Claude Desktop config is not an object".to_string());
    };
    servers.insert(SERVER_NAME.to_string(), launcher.entry());
    write_config(config, root)
}

pub fn desktop_unregister(config: &Path) -> Result<(), String> {
    if !config.exists() {
        return Ok(());
    }
    let mut root = read_config(config)?;
    if let Some(Value::Object(servers)) = root.get_mut("mcpServers") {
        servers.remove(SERVER_NAME);
    }
    write_config(config, root)
}

pub fn claude_code_status(claude_json: &Path, launcher: &Launcher) -> Status {
    let text = match fs::read_to_string(claude_json) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => return Status::NotRegistered,
        Err(error) => {
            return Status::Unreadable {
                reason: error.to_string(),
            };
        }
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(root) => status_of_servers(root.get("mcpServers"), launcher),
        Err(error) => Status::Unreadable {
            reason: error.to_string(),
        },
    }
}

pub fn find_claude(path_var: &str, home: &Path) -> Option<PathBuf> {
    let exe = if cfg!(windows) {
        "claude.exe"
    } else {
        "claude"
    };
    let mut dirs: Vec<PathBuf> = std::env::split_paths(path_var).collect();
    dirs.extend([
        home.join(".claude").join("local"),
        home.join(".local").join("bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    dirs.into_iter()
        .map(|dir| dir.join(exe))
        .find(|candidate| candidate.is_file())
}

fn run_with_timeout(mut command: Command, limit: Duration) -> Result<(bool, String), String> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let started = Instant::now();
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                let output = child.wait_with_output().map_err(|e| e.to_string())?;
                let text = format!(
                    "{}{}",
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                );
                return Ok((status.success(), text.trim().to_string()));
            }
            None if started.elapsed() > limit => {
                let _ = child.kill();
                return Err("claude did not answer in time".to_string());
            }
            None => std::thread::sleep(Duration::from_millis(100)),
        }
    }
}

pub fn claude_code_register(claude: &Path, launcher: &Launcher) -> Result<String, String> {
    let mut remove = Command::new(claude);
    remove.args(["mcp", "remove", "--scope", "user", SERVER_NAME]);
    let _ = run_with_timeout(remove, Duration::from_secs(30));

    let mut add = Command::new(claude);
    add.args(launcher.claude_add_args());
    let (ok, text) = run_with_timeout(add, Duration::from_secs(60))?;
    if ok { Ok(text) } else { Err(text) }
}

pub fn claude_code_unregister(claude: &Path) -> Result<String, String> {
    let mut remove = Command::new(claude);
    remove.args(["mcp", "remove", "--scope", "user", SERVER_NAME]);
    let (ok, text) = run_with_timeout(remove, Duration::from_secs(30))?;
    if ok { Ok(text) } else { Err(text) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn launcher() -> Launcher {
        Launcher {
            command: PathBuf::from("/Apps/DoU.app/Contents/MacOS/dou-mcp"),
            profile: PathBuf::from("/Users/x/Library/Application Support/io.chatic/agent"),
        }
    }

    fn desktop(dir: &Path) -> PathBuf {
        let claude_dir = dir.join("Claude");
        fs::create_dir_all(&claude_dir).expect("dir");
        claude_dir.join("claude_desktop_config.json")
    }

    #[test]
    fn the_config_path_is_per_platform() {
        let home = Path::new("/Users/x");
        assert_eq!(
            claude_desktop_config_path(home, None),
            Path::new("/Users/x/Library/Application Support/Claude/claude_desktop_config.json")
        );
        assert_eq!(
            claude_desktop_config_path(home, Some(Path::new("C:/Users/x/AppData/Roaming"))),
            Path::new("C:/Users/x/AppData/Roaming/Claude/claude_desktop_config.json")
        );
    }

    #[test]
    fn without_a_claude_directory_desktop_is_not_installed_and_register_refuses() {
        let dir = tempfile::tempdir().expect("temp dir");
        let config = dir.path().join("Claude").join("claude_desktop_config.json");
        assert_eq!(desktop_status(&config, &launcher()), Status::NotInstalled);
        assert!(desktop_register(&config, &launcher()).is_err());
        assert!(!config.exists());
    }

    #[test]
    fn registering_keeps_every_other_key_and_backs_up_once() {
        let dir = tempfile::tempdir().expect("temp dir");
        let config = desktop(dir.path());
        let original =
            r#"{"theme":"dark","mcpServers":{"other":{"command":"x","args":["1"]}},"z":[1,2]}"#;
        fs::write(&config, original).expect("write");

        desktop_register(&config, &launcher()).expect("register");

        let after: Value =
            serde_json::from_str(&fs::read_to_string(&config).expect("read")).expect("json");
        assert_eq!(after["theme"], "dark");
        assert_eq!(after["z"], json!([1, 2]));
        assert_eq!(after["mcpServers"]["other"]["command"], "x");
        assert_eq!(
            after["mcpServers"]["dou"]["command"],
            "/Apps/DoU.app/Contents/MacOS/dou-mcp"
        );
        assert_eq!(after["mcpServers"]["dou"]["args"][0], "--profile");
        assert_eq!(desktop_status(&config, &launcher()), Status::Registered);

        let backup = PathBuf::from(format!("{}.dou-backup", config.display()));
        assert_eq!(fs::read_to_string(&backup).expect("backup"), original);
        desktop_register(&config, &launcher()).expect("again");
        assert_eq!(fs::read_to_string(&backup).expect("backup"), original);
    }

    #[test]
    fn a_missing_config_file_is_created_with_only_the_dou_entry() {
        let dir = tempfile::tempdir().expect("temp dir");
        let config = desktop(dir.path());
        assert_eq!(desktop_status(&config, &launcher()), Status::NotRegistered);
        desktop_register(&config, &launcher()).expect("register");
        let after: Value =
            serde_json::from_str(&fs::read_to_string(&config).expect("read")).expect("json");
        assert_eq!(after["mcpServers"].as_object().map(|m| m.len()), Some(1));
    }

    #[test]
    fn a_config_that_is_not_json_is_never_overwritten() {
        let dir = tempfile::tempdir().expect("temp dir");
        let config = desktop(dir.path());
        fs::write(&config, "{ broken").expect("write");
        assert!(desktop_register(&config, &launcher()).is_err());
        assert_eq!(fs::read_to_string(&config).expect("read"), "{ broken");
        assert!(matches!(
            desktop_status(&config, &launcher()),
            Status::Unreadable { .. }
        ));
    }

    #[test]
    fn a_different_dou_entry_is_reported_as_different() {
        let dir = tempfile::tempdir().expect("temp dir");
        let config = desktop(dir.path());
        fs::write(
            &config,
            r#"{"mcpServers":{"dou":{"command":"/old/dou-mcp","args":[]}}}"#,
        )
        .expect("write");
        assert_eq!(
            desktop_status(&config, &launcher()),
            Status::Different {
                command: "/old/dou-mcp".into()
            }
        );
    }

    #[test]
    fn unregister_removes_only_the_dou_entry() {
        let dir = tempfile::tempdir().expect("temp dir");
        let config = desktop(dir.path());
        fs::write(&config, r#"{"mcpServers":{"other":{"command":"x"}}}"#).expect("write");
        desktop_register(&config, &launcher()).expect("register");
        desktop_unregister(&config).expect("unregister");
        let after: Value =
            serde_json::from_str(&fs::read_to_string(&config).expect("read")).expect("json");
        assert!(after["mcpServers"].get("dou").is_none());
        assert_eq!(after["mcpServers"]["other"]["command"], "x");
    }

    #[test]
    fn the_claude_code_command_is_a_fixed_vector_with_a_double_dash() {
        let args = launcher().claude_add_args();
        assert_eq!(&args[..6], ["mcp", "add", "--scope", "user", "dou", "--"]);
        assert_eq!(args[6], "/Apps/DoU.app/Contents/MacOS/dou-mcp");
        assert_eq!(args[7], "--profile");
        assert_eq!(args.len(), 9);
    }

    #[test]
    fn the_copyable_command_quotes_every_argument() {
        let mut l = launcher();
        l.profile = PathBuf::from("/Users/o'neil/Application Support/agent");
        let text = l.claude_command_text();
        assert!(text.starts_with("claude 'mcp' 'add'"));
        assert!(text.contains("'/Users/o'\\''neil/Application Support/agent'"));
    }

    #[test]
    fn claude_code_status_reads_user_scope_servers() {
        let dir = tempfile::tempdir().expect("temp dir");
        let json_path = dir.path().join(".claude.json");
        assert_eq!(
            claude_code_status(&json_path, &launcher()),
            Status::NotRegistered
        );
        let l = launcher();
        fs::write(
            &json_path,
            json!({ "mcpServers": { "dou": l.entry() } }).to_string(),
        )
        .expect("write");
        assert_eq!(claude_code_status(&json_path, &l), Status::Registered);
        fs::write(&json_path, "nope").expect("write");
        assert!(matches!(
            claude_code_status(&json_path, &l),
            Status::Unreadable { .. }
        ));
    }

    #[test]
    fn claude_is_found_on_the_path_or_in_the_usual_places() {
        let dir = tempfile::tempdir().expect("temp dir");
        let bin = dir.path().join("bin");
        fs::create_dir_all(&bin).expect("dir");
        let exe = if cfg!(windows) {
            "claude.exe"
        } else {
            "claude"
        };
        assert_eq!(find_claude(&bin.to_string_lossy(), dir.path()), None);
        fs::write(bin.join(exe), "").expect("write");
        assert_eq!(
            find_claude(&bin.to_string_lossy(), dir.path()),
            Some(bin.join(exe))
        );

        let local = dir.path().join(".local").join("bin");
        fs::create_dir_all(&local).expect("dir");
        fs::write(local.join(exe), "").expect("write");
        assert_eq!(find_claude("", dir.path()), Some(local.join(exe)));
    }
}
