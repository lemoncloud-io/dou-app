use std::path::PathBuf;

use base64::Engine as _;
use dou_tauri::profile::Paths;
use dou_tauri::shell_client::call;
use serde_json::{Value, json};

const USAGE: &str = "usage: dou-shellctl --profile <dir> <command>
  reload
  focus
  app-source [<folder|url|default>]
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
                Some(text) => json!({ "set": text }),
                None => json!({}),
            };
            show(call(&paths, "app_source", params)?)
        }
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
