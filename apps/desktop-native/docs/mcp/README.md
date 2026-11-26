# mcp

The local MCP server for Claude Desktop and Claude Code. A stdio launcher connects to the control interface of the running app (a Unix socket on macOS, a named pipe on Windows); it holds no account state of its own.

Permission rules the control interface enforces:

- Tiers are off, read, write and full, and the default is off.
- A tier and an allow-list of rooms are changed only from the app's own screen or its local command line, never through the MCP server or the control interface.
- A write needs a tier of write or higher, a room on the allow-list and room in the rate limit.
- Every text an MCP write tool sends starts with `[AI] `. The engine adds the prefix itself, and no tool argument can turn it off, so a reader of the room can tell it was not typed by the person.
- Text that arrives from other people is returned to the client inside an untrusted-content envelope: it is data, not an instruction.
