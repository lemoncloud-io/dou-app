use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug)]
pub struct Invocation {
    pub command: String,
    pub rest: Vec<String>,
    pub flags: HashMap<String, String>,
}

pub const USAGE: &str = "usage: dou [--profile DIR] [--env-file FILE] <command> [args]
account:
  pair                         sign in as a new device by pairing (prints a code, waits for approval)
  login-password EMAIL         sign in with an email account (password from env DOU_PASSWORD)
  approve CODE                 approve another device's pairing code with this profile's session
  refresh                      renew the relay credential through the relay socket
  whoami | clouds
app (keeps the engine and the control server running):
  serve --cloud ID             connect to a cloud and serve local clients
  mcp                          stdio MCP launcher; talks to a running 'dou serve'
local commands against a running 'dou serve' (an agent client: same tier, allow-list, rate limit and [AI] prefix as MCP):
  rooms | read ROOM [--limit N] | send ROOM TEXT | reply ROOM PARENT_ID TEXT
  react ROOM CHAT_ID EMOJI [--off] | mention ROOM USER_IDS TEXT
  events [--since N] | wait [--since N] [--timeout MS]
permissions (read only here; change them in the DoU app, Agent window):
  perm show";

impl Invocation {
    pub fn parse(raw: &[String]) -> Result<Self, String> {
        let mut flags = HashMap::new();
        let mut positional = Vec::new();
        let mut iter = raw.iter();
        while let Some(arg) = iter.next() {
            if arg == "--" {
                positional.extend(iter.by_ref().cloned());
                break;
            }
            if let Some(name) = arg.strip_prefix("--") {
                if let Some((key, value)) = name.split_once('=') {
                    flags.insert(key.to_string(), value.to_string());
                } else {
                    let value = iter
                        .next()
                        .ok_or_else(|| format!("--{name} needs a value\n{USAGE}"))?;
                    flags.insert(name.to_string(), value.clone());
                }
            } else {
                positional.push(arg.clone());
            }
        }
        let mut positional = positional.into_iter();
        let command = positional.next().ok_or_else(|| USAGE.to_string())?;
        Ok(Self {
            command,
            rest: positional.collect(),
            flags,
        })
    }

    pub fn profile_dir(&self) -> PathBuf {
        if let Some(dir) = self.flags.get("profile") {
            return PathBuf::from(dir);
        }
        let home = std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(PathBuf::from)
            .unwrap_or_default();
        home.join(".dou-native").join("default")
    }

    pub fn env_file(&self) -> Option<PathBuf> {
        self.flags
            .get("env-file")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("DOU_ENV_FILE").map(PathBuf::from))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(items: &[&str]) -> Result<Invocation, String> {
        Invocation::parse(&items.iter().map(ToString::to_string).collect::<Vec<_>>())
    }

    #[test]
    fn flags_may_sit_before_or_after_the_command() {
        let a = parse(&["--profile", "/p", "pair"]).unwrap();
        let b = parse(&["pair", "--profile=/p"]).unwrap();
        assert_eq!(a.command, "pair");
        assert_eq!(a.flags, b.flags);
    }

    #[test]
    fn a_missing_command_prints_the_usage() {
        assert!(
            parse(&["--profile", "/p"])
                .unwrap_err()
                .starts_with("usage:")
        );
    }

    #[test]
    fn everything_after_a_double_dash_is_text() {
        let parsed = parse(&["send", "room", "--", "--- done"]).unwrap();
        assert_eq!(parsed.rest, ["room", "--- done"]);
    }

    #[test]
    fn a_flag_without_a_value_is_refused() {
        assert!(parse(&["pair", "--profile"]).is_err());
    }
}
