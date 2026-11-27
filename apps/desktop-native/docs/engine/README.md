# engine

The headless engine: signing, HTTP, the socket protocol, a SQLite cache and an outbox, with no screen in the process.

The engine is held to the TS engine by two tests, described in [vectors](../vectors/README.md) and in ADR-0382: byte-identical contract vectors and black-box domain scenarios.

Crates depend downward only: `dou-core` ← `dou-signing` ← the HTTP, auth and socket crates ← the store and the engine ← the control server ← the MCP launcher and the command line. No engine crate imports a screen crate.

## Search and members

`Engine::search` answers from the local store first. Only when that finds fewer than the limit does it page `chat.feed` backwards (at most 5 pages of 100, stopping once a page is older than `since`), filter by keyword and time on the client and drop chats it already has. The server has no search API. A relay failure keeps the local hits and is reported next to them. `Engine::members` reads `channel.list-user`.
