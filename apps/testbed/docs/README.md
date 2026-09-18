# apps/testbed documentation

A chat-shell-shaped app for verifying `app-runtime`/`data` through real user flows. The overview,
scope and global rules live in the [app README](../README.md); these documents cover each screen in
turn.

## Tree rules

1. Every category folder has a `README.md` — either the category's lead document, or a short index.
2. A category name has to answer "does this document belong here?" on its own. Names that cannot
   (`misc`, `common`, `architecture`) are not used.
3. Depth stops at `docs/<category>/<topic>.md`. Needing another level means the category is wrong.
4. No topic files directly under `docs/` — this file is the only top-level document.

## Categories

| Category                        | Answers                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| [session/](./session/README.md) | Login, logout semantics (cloud vs. relay), and the invite accept flow  |
| [chat/](./chat/README.md)       | The chat home list, the chat room, and place/channel create-and-rename |
| [overlay/](./overlay/README.md) | The global runtime inspector — session, socket and DB state            |
