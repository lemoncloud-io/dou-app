# agent

The native "DoU Agent" window. The Rust engine and the local MCP server of `apps/desktop-native` no longer run inside this app: DoU logic runs in TypeScript on `@chatic/runtime` through `libs/runtime-node`, and the Rust engine crates are parked. This shell links none of them (`dou-app`, `dou-auth`, `dou-control`, `dou-http`, `dou-socket`, `dou-core`, `dou-mcp`).

## State today

The window is in place and disconnected. `agent_state` reports signed out, engine stopped, pairing idle; `agent_pair_start`, `agent_clouds` and `agent_choose_cloud` answer that the engine is not connected; `agent_rooms` is empty. Settings and Connectors keep working. The shell no longer ships or registers a `dou-mcp` launcher binary; a later step re-adds the pipe to the Node side and rewires this window.

## Permissions

The Permissions tab edits `settings.json` in the profile folder through `crates/agent-settings`: the tier (off, read, write, full; off by default), the rooms writes are allowed in, and the write rate limit (1–600 a minute, 1–10000 an hour, hour not below minute, at most 500 rooms). The crate owns these types.

## Connectors

`crates/connectors` registers a launcher with Claude Desktop (merging `mcpServers.dou` into `claude_desktop_config.json`, keeping every other key, with a one-time `.dou-backup` copy and an atomic write) and Claude Code (`claude mcp add --scope user dou -- <launcher> --profile <dir>` as a fixed argument vector, no shell). Status is read from the config files, not from a live connection. While no launcher ships, Connect reports it missing and registers nothing.

## The window

`ui/agent/` is plain HTML and JavaScript served from the app, under a strict content security policy, in a window with its own capability. Every `agent_*` command checks that the caller is the window labelled `agent`; the remote web's capability allows `bridge_request` and `log_event` only. The window is opened from the Agent menu (Ctrl or Cmd + Shift + A); a debug build also opens it when `DOU_OPEN_AGENT` is set.

`DOU_VAULT_KEY_FILE` (any value) keeps the vault key in a file in the profile folder instead of the OS keychain; read in debug builds only, for unattended runs and CI; a release build ignores it.
