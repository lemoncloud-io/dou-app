use std::path::PathBuf;
use std::process::ExitCode;

use dou_control::{Client, control_name};

fn profile_dir_from(args: &[String]) -> Option<PathBuf> {
    let at = args.iter().position(|a| a == "--profile")?;
    args.get(at + 1).map(PathBuf::from)
}

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let Some(profile) = profile_dir_from(&args) else {
        eprintln!("usage: dou-mcp --profile DIR");
        return ExitCode::from(2);
    };
    let name = control_name(&profile, Client::Mcp);
    match dou_mcp::run(tokio::io::stdin(), tokio::io::stdout(), name).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("dou-mcp: {error}");
            ExitCode::FAILURE
        }
    }
}
