# MCP server

`dou-cli serve` answers the Model Context Protocol on `<profile>/mcp.sock`. One server, one profile, any number of clients. A client is normally the shell's `dou-mcp --profile <dir>`, a byte pipe from a stdio MCP client (Claude Code) to this socket.

```
Claude Code --stdio--> dou-mcp --mcp.sock--> dou-cli serve --shell.sock--> desktop shell
                                                  |
                                          @chatic/runtime (DoU session)
```

## Transport

- Newline-delimited JSON-RPC 2.0, the MCP stdio framing, over a Unix socket (mode `0600`, removed on exit). A socket left by a dead process is replaced; a live one makes `serve` fail with `another dou-cli already serves …`.
- Windows: a named pipe `\\.\pipe\dou-mcp-…`; its name is written to `<profile>/mcp.pipe` (the shell does the same for `shell.pipe`).
- Implemented methods: `initialize` (echoes the client's protocol version), `ping`, `tools/list`, `tools/call`; notifications get no answer. No MCP SDK is used.
- Non-MCP methods for the shell's Agent window, ignored by MCP clients: `dou/status` (signed in, user, active server) and `dou/clouds` (active cloud and the clouds the pairing entered). Choosing the active cloud is not offered: dou-cli has no API for it yet.

## Tools

`tools/list` returns everything [`createAgentTools`](../../../../libs/agent-tools/README.md) builds (DoU tools and their gate), then the harness tools below. DoU tools run in this process on the runtime; harness tools are forwarded to `<profile>/shell.sock` as one JSON-RPC call each and carry no logic here.

| Tool             | Shell method                                               | Tier needed               |
| ---------------- | ---------------------------------------------------------- | ------------------------- |
| `app_reload`     | `reload`                                                   | write                     |
| `app_source`     | `app_source` (`set` switches the app)                      | read to get, write to set |
| `screenshot`     | `screenshot` — returned as an MCP `image` block            | read                      |
| `logs_tail`      | `logs_tail` (`file`: webview, node, shell; `lines` ≤ 1000) | read                      |
| `mini_app_open`  | `mini_app_open` (params passed through)                    | write                     |
| `mini_app_list`  | `mini_app_list`                                            | read                      |
| `mini_app_close` | `mini_app_close` (params passed through)                   | write                     |

When the shell is not running a harness tool returns the tool error `shell_unavailable`; DoU tools are unaffected.

## Permissions

`<profile>/settings.json` is read on every call ([permissions](../../../../libs/agent-tools/docs/permissions/README.md)). A missing file, or one that cannot be read or parsed, means the default: tier `off`, no rooms. Harness tools follow the tier only: `off` refuses all, `read` refuses the ones marked write. The owner edits the file from the shell's Agent window; no tool changes it.

A screenshot shows whatever is on screen, including rooms outside `allowRooms`; it is allowed at tier `read` because the owner who runs the harness sees the same screen.
