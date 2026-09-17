# apps/admin-v2 documentation

The operator console's overview, scope and login model live in the [app README](../README.md); these
documents cover each console feature in turn.

## Tree rules

1. Every category folder has a `README.md` — either the category's lead document, or a short index.
2. A category name has to answer "does this document belong here?" on its own. Names that cannot
   (`misc`, `common`, `architecture`) are not used.
3. Depth stops at `docs/<category>/<topic>.md`. Needing another level means the category is wrong.
4. No topic files directly under `docs/` — this file is the only top-level document.

## Categories

| Category                                | Answers                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| [auth/](./auth/README.md)               | OAuth login hydration and the token-refresh loop             |
| [memberships/](./memberships/README.md) | Viewing and overriding a user's subscription                 |
| [report-logs/](./report-logs/README.md) | Tracing a user report or an app log to a failure             |
| [socket-lab/](./socket-lab/README.md)   | The multi-client WebSocket lab and its live device-watch tab |
