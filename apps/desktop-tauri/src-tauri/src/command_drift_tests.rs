const BUILD: &str = include_str!("../build.rs");
const LIB: &str = include_str!("lib.rs");
const AGENT_CAPABILITY: &str = include_str!("../capabilities/agent.json");

fn quoted(text: &str) -> Vec<String> {
    text.split('"')
        .skip(1)
        .step_by(2)
        .map(str::to_string)
        .collect()
}

fn built_commands() -> Vec<String> {
    let list = BUILD
        .split(".commands(&[")
        .nth(1)
        .and_then(|rest| rest.split("])").next())
        .expect("the command list in build.rs");
    quoted(list)
}

fn handler_commands() -> Vec<String> {
    let list = LIB
        .split("generate_handler![")
        .nth(1)
        .and_then(|rest| rest.split(']').next())
        .expect("generate_handler in lib.rs");
    list.split(',')
        .map(|path| path.trim().rsplit("::").next().unwrap_or_default().to_string())
        .filter(|name| !name.is_empty())
        .collect()
}

fn granted_to_agent() -> Vec<String> {
    let permissions = AGENT_CAPABILITY
        .split("\"permissions\"")
        .nth(1)
        .expect("permissions in agent.json");
    quoted(permissions)
        .into_iter()
        .filter_map(|p| p.strip_prefix("allow-").map(|c| c.replace('-', "_")))
        .collect()
}

fn sorted(mut names: Vec<String>) -> Vec<String> {
    names.sort_unstable();
    names
}

#[test]
fn every_command_the_app_serves_is_declared_in_the_build_manifest() {
    assert_eq!(sorted(handler_commands()), sorted(built_commands()));
}

#[test]
fn every_agent_command_is_granted_to_the_agent_window() {
    let agent: Vec<String> = built_commands()
        .into_iter()
        .filter(|name| name.starts_with("agent_"))
        .collect();
    assert!(!agent.is_empty());
    assert_eq!(sorted(granted_to_agent()), sorted(agent));
}

#[test]
fn the_agent_window_cannot_reach_the_bridge() {
    assert!(!granted_to_agent().iter().any(|name| name == "bridge_request"));
}
