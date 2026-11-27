# agent

The native "DoU Agent" window. No DoU engine runs inside this app: DoU logic runs in TypeScript on `@chatic/runtime` through `libs/runtime-node`, in the dou-cli sidecar. The shell links no engine crate; its own `dou-mcp` binary is only a byte pipe.

## The engine is dou-cli

The shell starts one `dou-cli --profile <dir> serve` per profile (see [shell](../shell/README.md#node-sidecar)). dou-cli runs the DoU runtime and serves MCP on `<dir>/mcp.sock`; this window only displays and edits.

| Tab or command                          | Source                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine sign-in: signed in, engine state | `dou/status` on `mcp.sock` (`agent_state`)                                                                                                            |
| Pairing code                            | the shell pauses the sidecar, runs `dou-cli pair`, shows `pairing code: …` from its output and starts `serve` again when it ends (`agent_pair_start`) |
| Cloud list                              | `dou/clouds` (`agent_clouds`). `agent_choose_cloud` answers that choosing is not supported: dou-cli enters the cloud its pairing was approved for     |
| Rooms in Permissions                    | the `rooms_list` tool through `mcp.sock` (`agent_rooms`); it needs tier read or higher                                                                |
| Permissions                             | `settings.json` through `crates/agent-settings`; dou-cli re-reads it on every call                                                                    |
| Connectors                              | registers `dou-mcp --profile <dir>`, the byte pipe from a client's stdio to `mcp.sock`                                                                |

Without a `dou-cli` beside the app (or, in a debug build, `DOU_CLI_BIN` / `DOU_CLI_NODE_SCRIPT`) the engine shows as stopped and pairing says the sidecar was not found.

## State push

While the Agent window is visible and not minimised, `src-tauri/src/agent_push.rs` builds the window state once a second and emits `agent-state` to that window only when it differs from the last one sent; `agent.js` re-renders the Account tab on the event instead of polling. A hidden, closed or minimised window costs one visibility check a second. Each tick asks the dou-cli sidecar for `dou/status` over `mcp.sock` and reads its process status, the same as the `agent_state` command. The tick lives in Rust because the sidecar sends no change notification; one would replace the tick.

## Permissions

The Permissions tab edits `settings.json` in the profile folder through `crates/agent-settings`: the tier (off, read, write, full; off by default), the rooms writes are allowed in, and the write rate limit (1–600 a minute, 1–10000 an hour, hour not below minute, at most 500 rooms). The crate owns these types.

## Connectors

`crates/connectors` registers a launcher with Claude Desktop (merging `mcpServers.dou` into `claude_desktop_config.json`, keeping every other key, with a one-time `.dou-backup` copy and an atomic write) and Claude Code (`claude mcp add --scope user dou -- <launcher> --profile <dir>` as a fixed argument vector, no shell). Status is read from the config files, not from a live connection. The launcher is the `dou-mcp` binary beside the app; while it is missing, Connect reports that and registers nothing.

## The window

`ui/agent/` is plain HTML and JavaScript served from the app, under a strict content security policy, in a window with its own capability. Every `agent_*` command checks that the caller is the window labelled `agent`; the remote web's capability allows `bridge_request` and `log_event` only. The window is opened from the Agent menu (Ctrl or Cmd + Shift + A) or the tray (Open DoU Agent…); a debug build also opens it when `DOU_OPEN_AGENT` is set.

`DOU_VAULT_KEY_FILE` (any value) keeps the vault key in a file in the profile folder instead of the OS keychain; read in debug builds only, for unattended runs and CI; a release build ignores it.
