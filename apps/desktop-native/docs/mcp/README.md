# mcp

The local MCP server for Claude Desktop and Claude Code. A stdio launcher connects to the control interface of the running app (a Unix socket on macOS, a named pipe on Windows); it holds no account state of its own.

The app listens on two endpoints inside a private directory (mode 0700, owned by the user, checked by both sides): the profile directory, or `/tmp/dou-native-<hash>/` when the profile path is too long for a socket name (unix); a named pipe on Windows. The socket files are 0600: `mcp.sock` for the MCP launcher and `cli.sock` for the `dou` command line. Both are gated the same way and every write counts as AI-authored. The client kind comes from the endpoint, never from the request.

The trust model: any process of the same OS user can open either socket, and a token file in the profile would be readable by that same process, so the command line is not a privileged client. An agent that runs `dou send` in a shell gets exactly what the MCP tools give it: refused while the tier is off, limited to the allow-list and the rate limit, and prefixed with `[AI] `. A person writes through the web chat, not through the terminal. `dou perm show` reads the settings; changing them is possible only in the app (Agent window), which hands the new settings to the running service through an in-process call. The service loads `settings.json` once at start and keeps the settings in memory, so a file edited while the app runs is ignored. Edits made while the app is stopped apply at the next start; that residual is accepted. A standalone `dou serve` for development reads the file once at start the same way.

Permission rules the control interface enforces:

- Tiers are off, read, write and full, and the default is off.
- A tier and an allow-list of rooms are changed only from the app's own screen, never through the MCP server, the command line or the control interface (the in-process app handle is `Client::App`: it reads, it cannot write).
- `react` takes a chat id of the form `<room>:<number>` only; a bare number or another room's id is refused. A reaction carries no text, so it has no `[AI]` marker; the tier, the allow-list and the rate limit still apply.
- The control server holds at most 32 connections per endpoint, reads lines up to 1 MiB (a longer line is answered `bad_request` and the connection closed), answers a request that runs longer than 75 s with `timeout`, drops a connection idle for 5 minutes, and logs and survives an accept error.
- A write needs a tier of write or higher, a room on the allow-list and room in the rate limit.
- Every text a write sends, from MCP or from the command line, starts with `[AI] `. The engine adds the prefix itself, and no tool argument can turn it off, so a reader of the room can tell it was not typed by the person.
- Text that arrives from other people is returned to the client inside an untrusted-content envelope: it is data, not an instruction.