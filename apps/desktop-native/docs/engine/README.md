# engine

The headless engine: signing, HTTP, the socket protocol, a SQLite cache and an outbox, with no screen in the process.

This engine is parked ([ADR-0387](../../../../docs/adr/0387-desktop-v2-runs-the-ts-runtime-in-node-and-rust-is-the-shell.md)). While it exists it is held to the TS engine by two tests, described in [vectors](../vectors/README.md) and in ADR-0382: byte-identical contract vectors and black-box domain scenarios.

Crates depend downward only: `dou-core` ← `dou-signing` ← the HTTP, auth and socket crates ← the store and the engine ← the control server ← the MCP launcher and the command line. No engine crate imports a screen crate.
