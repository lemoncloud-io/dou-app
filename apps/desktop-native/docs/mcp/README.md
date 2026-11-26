# mcp

The local MCP server for Claude Desktop and Claude Code. A stdio launcher connects to the control interface of the running app (a Unix socket on macOS, a named pipe on Windows); it holds no account state of its own.

The app listens on two endpoints in the profile directory (file mode 0600; a named pipe on Windows): `mcp.sock`, whose clients are always treated as MCP and so are gated, and `cli.sock`, whose clients are the owner and are not gated. The client kind comes from the endpoint, never from the request. The trust model is that a process able to open `cli.sock` or edit `settings.json` runs as the same OS user and is the owner, so an agent with an unrestricted shell on the same account can already act as the owner; the gate is for an MCP client that has no shell.

Permission rules the control interface enforces:

- Tiers are off, read, write and full, and the default is off.
- A tier and an allow-list of rooms are changed only from the app's own screen or its local command line, never through the MCP server or the control interface.
- A write needs a tier of write or higher, a room on the allow-list and room in the rate limit.
- Every text an MCP write tool sends starts with `[AI] `. The engine adds the prefix itself, and no tool argument can turn it off, so a reader of the room can tell it was not typed by the person.
- Text that arrives from other people is returned to the client inside an untrusted-content envelope: it is data, not an instruction.