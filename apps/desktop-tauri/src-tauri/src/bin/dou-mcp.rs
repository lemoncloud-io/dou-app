use std::path::PathBuf;
use std::time::Duration;

use dou_tauri::mcp_pipe::bridge;
use dou_tauri::profile::Paths;

const USAGE: &str = "usage: dou-mcp --profile <dir>";
const WAIT: Duration = Duration::from_secs(15);

fn profile_of(args: &[String]) -> Result<PathBuf, String> {
    let at = args
        .iter()
        .position(|arg| arg == "--profile")
        .ok_or("--profile is required")?;
    args.get(at + 1)
        .map(PathBuf::from)
        .ok_or_else(|| "--profile needs a folder".to_string())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let outcome = profile_of(&args).and_then(|profile| {
        let root = profile
            .canonicalize()
            .map_err(|e| format!("{}: {e}", profile.display()))?;
        bridge(&Paths::new(root), WAIT, std::io::stdin(), std::io::stdout())
    });
    if let Err(error) = outcome {
        eprintln!("dou-mcp: {error}\n{USAGE}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn the_profile_flag_is_required_and_needs_a_value() {
        assert_eq!(
            profile_of(&list(&["--profile", "/p"])).expect("ok"),
            PathBuf::from("/p")
        );
        assert!(profile_of(&list(&[])).is_err());
        assert!(profile_of(&list(&["--profile"])).is_err());
    }
}
