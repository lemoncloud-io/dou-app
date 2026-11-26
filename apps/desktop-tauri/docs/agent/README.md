# agent

The Rust engine and the local MCP server of `apps/desktop-native`, run inside this app, and the native "DoU Agent" window that controls them. The engine crates are used as path dependencies and are not edited here.

## The engine in the app

`src-tauri/src/agent/host.rs` is the glue (the same steps as `dou serve`, through `dou_app::start`): it opens the profile directory `<app data>/agent`, renews the relay credential, links to one cloud, runs the control service and listens on two sockets — one for the owner (this app) and one for MCP clients. At start-up the engine starts by itself when the profile is signed in and a cloud is chosen.

Endpoints are constants per stage (dev and production relay and socket addresses, none secret), overridable at build time with `DOU_RELAY_ENDPOINT` and `DOU_WS_ENDPOINT`.

## Signing the engine in

The engine is its own device. The Agent window starts a pairing request and shows the code; the person approves it in the DoU window (the web's pairing approve page, which the window can open). Nothing — token, cookie or password — crosses from the page to Rust. The web's own session is not reused: that would make two engines share one credential.

Then the person picks a cloud (listed from the relay) and the engine starts. Switching to another cloud needs an app restart.

## Permissions

The Permissions tab edits `settings.json` in the profile directory through `crates/agent-settings`: the tier (off, read, write, full; off by default), the rooms writes are allowed in, and the write rate limit (1–600 a minute, 1–10000 an hour, hour not below minute, at most 500 rooms). It is the only writer: the MCP socket and the owner socket of `dou-control` cannot change it. The control service reads the file on each call, so a save applies at once.

## Connectors

`dou-mcp` is a second binary of this package (a console program, because the app binary has no stdio on Windows). It takes `--profile DIR`, connects to the MCP socket of the running app and speaks MCP on stdin and stdout. It holds no account state.

`crates/connectors` registers it:

- **Claude Desktop** — merges `mcpServers.dou` into `claude_desktop_config.json` (`~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on Windows), keeps every other key, copies the file once to `.dou-backup` first, writes through a temp file and refuses a file that is not a JSON object. Claude Desktop must be restarted.
- **Claude Code** — runs `claude mcp add --scope user dou -- <launcher> --profile <dir>` as a fixed argument vector (no shell), after removing an older `dou` entry. `claude` is looked up on `PATH`, then in `~/.claude/local`, `~/.local/bin`, `/opt/homebrew/bin` and `/usr/local/bin`, since a GUI app has a short `PATH`. When it is not found the window shows the command to copy.

Status is read from the config files (`mcpServers.dou` and the launcher it points at), not from a live connection.

## The window

`ui/agent/` is plain HTML and JavaScript served from the app, under a strict content security policy, in a window with its own capability. Every `agent_*` command checks that the caller is the window labelled `agent`; the remote web's capability allows `bridge_request` only. The window is opened from the Agent menu (Ctrl or Cmd + Shift + A). A debug build also opens it when `DOU_OPEN_AGENT` is set, and starts pairing at launch when `DOU_AGENT_AUTOPAIR` is set and prints the code, for unattended runs.

`DOU_VAULT_KEY_FILE` (any value) keeps the vault key in a file in the app data directory instead of the OS keychain; read in debug builds only, for unattended runs and CI, where a keychain prompt cannot be answered; a release build ignores it.
