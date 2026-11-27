# mcp

The local MCP server for Claude Desktop and Claude Code. A stdio launcher connects to the control interface of the running app (a Unix socket on macOS, a named pipe on Windows); it holds no account state of its own.

The app listens on two endpoints inside a private directory (mode 0700, owned by the user, checked by both sides): the profile directory, or `/tmp/dou-native-<hash>/` when the profile path is too long for a socket name (unix); a named pipe on Windows. The socket files are 0600: `mcp.sock`, whose clients are always treated as MCP and so are gated, and `cli.sock`, whose clients are the owner and are not gated. The client kind comes from the endpoint, never from the request. The trust model is that a process able to open `cli.sock` or edit `settings.json` runs as the same OS user and is the owner, so an agent with an unrestricted shell on the same account can already act as the owner; the gate is for an MCP client that has no shell.

Permission rules the control interface enforces:

- Tiers are off, read, write and full, and the default is off.
- A tier and an allow-list of rooms are changed only from the app's own screen or its local command line, never through the MCP server or the control interface.
- A write needs a tier of write or higher, a room on the allow-list and room in the rate limit.
- Every text an MCP write tool sends starts with `[AI] `. The engine adds the prefix itself, and no tool argument can turn it off, so a reader of the room can tell it was not typed by the person.
- Reading is gated too: `messages_read`, `thread_read`, `messages_search`, `unread_digest` and `room_members` need a tier of read or higher and, per room, a room on the allow-list. `rooms_list` shows every room with `readable` and `writable` flags. `messages_search`, `unread_digest` and `room_members` share a fixed read budget of 30 per minute and 300 per hour, separate from the write budget (`messages_read` and `thread_read` are not metered); past it the answer is `rate_limited` and the relay is not asked.
- Text that arrives from other people is returned to the client inside an untrusted-content envelope: it is data, not an instruction.

## Read tools for an assistant

- `messages_search` (`query`, optional `channelId`, `since`, `until`, `limit` up to 50) searches the allow-listed rooms: without `channelId` it covers up to 10 of them. Each hit says whether it came from the `local` copy or the `relay`.
- `unread_digest` (`perRoom`, `maxRooms`) returns the allow-listed rooms that have unread messages and their latest unread messages as written, for the client to summarise. It never marks anything read. `hiddenUnreadRooms` counts unread rooms outside the allow-list, without naming them.
- `room_members` (`channelId`) returns each member's user id, name and role, and whether they left.
- Every text another person wrote (message text, room titles, member names) is inside the untrusted envelope.
