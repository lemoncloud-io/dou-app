use std::path::PathBuf;

use base64::Engine as _;
use dou_tauri::profile::Paths;
use dou_tauri::shell_client::call;
use serde_json::{Value, json};

const USAGE: &str = "usage: dou-shellctl --profile <dir> <command>
  reload
  focus
  app-source [<folder|url|default>]
  mini-app open <folder|url>
  mini-app list
  mini-app close [<viewId>]
  screenshot <out.png>
  logs [shell|webview|node] [lines]";

fn parse(args: &[String]) -> Result<(PathBuf, Vec<String>), String> {
    let mut profile = None;
    let mut rest = Vec::new();
    let mut at = 0;
    while at < args.len() {
        if args[at] == "--profile" {
            profile = Some(PathBuf::from(
                args.get(at + 1).ok_or("--profile needs a folder")?,
            ));
            at += 2;
        } else {
            rest.push(args[at].clone());
            at += 1;
        }
    }
    Ok((profile.ok_or("--profile is required")?, rest))
}

fn absolute(text: &str) -> String {
    if text == "default" || text.starts_with("http://") || text.starts_with("https://") {
        return text.to_string();
    }
    std::fs::canonicalize(text).map_or_else(|_| text.to_string(), |p| p.display().to_string())
}

fn run(args: &[String]) -> Result<String, String> {
    let (profile, rest) = parse(args)?;
    let paths = Paths::new(
        profile
            .canonicalize()
            .map_err(|e| format!("{}: {e}", profile.display()))?,
    );
    let command = rest
        .first()
        .map(String::as_str)
        .ok_or("a command is required")?;
    let show = |value: Value| serde_json::to_string_pretty(&value).map_err(|e| e.to_string());
    match command {
        "reload" | "focus" => show(call(&paths, command, json!({}))?),
        "app-source" => {
            let params = match rest.get(1) {
                Some(text) => json!({ "set": absolute(text) }),
                None => json!({}),
            };
            show(call(&paths, "app_source", params)?)
        }
        "mini-app" => match rest.get(1).map(String::as_str) {
            Some("open") => {
                let source = rest.get(2).ok_or("mini-app open needs a folder or a URL")?;
                show(call(
                    &paths,
                    "mini_app_open",
                    json!({ "source": absolute(source) }),
                )?)
            }
            Some("list") => show(call(&paths, "mini_app_list", json!({}))?),
            Some("close") => {
                let params = rest
                    .get(2)
                    .map_or_else(|| json!({}), |id| json!({ "viewId": id }));
                show(call(&paths, "mini_app_close", params)?)
            }
            _ => Err("mini-app takes open, list or close".to_string()),
        },
        "screenshot" => {
            let out = rest.get(1).ok_or("screenshot needs an output file")?;
            let reply = call(&paths, "screenshot", json!({}))?;
            let png = base64::engine::general_purpose::STANDARD
                .decode(reply["base64"].as_str().ok_or("no image in the reply")?)
                .map_err(|e| e.to_string())?;
            std::fs::write(out, &png).map_err(|e| format!("{out}: {e}"))?;
            Ok(format!("{out} ({} bytes)", png.len()))
        }
        "logs" => {
            let file = rest.get(1).map_or("shell", String::as_str);
            let lines = rest
                .get(2)
                .and_then(|n| n.parse::<u64>().ok())
                .unwrap_or(100);
            let reply = call(&paths, "logs_tail", json!({ "file": file, "lines": lines }))?;
            Ok(reply["lines"]
                .as_array()
                .map(|l| {
                    l.iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default())
        }
        other => Err(format!("unknown command {other}")),
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(text) => println!("{text}"),
        Err(error) => {
            eprintln!("{error}\n{USAGE}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn the_profile_flag_is_taken_from_anywhere() {
        let (profile, rest) = parse(&list(&["reload", "--profile", "/p"])).expect("parse");
        assert_eq!(profile, PathBuf::from("/p"));
        assert_eq!(rest, ["reload"]);
        assert!(parse(&list(&["reload"])).is_err());
        assert!(parse(&list(&["--profile"])).is_err());
    }

    #[test]
    fn a_folder_is_sent_as_an_absolute_path_and_addresses_are_left_alone() {
        assert_eq!(absolute("https://x.test"), "https://x.test");
        assert_eq!(absolute("default"), "default");
        assert!(std::path::Path::new(&absolute(".")).is_absolute());
        assert_eq!(absolute("/no/such/folder"), "/no/such/folder");
    }
}
