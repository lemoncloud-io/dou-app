# chat

The home screen's conversation surfaces: the sidebar's channel and direct-message lists, the room
(`ChatPane`), and the composer. The code lives in `src/app/features/chat/`, with shared hooks and
stores in `src/app/shared/`.

## Documents

- [direct-messages.md](./direct-messages.md) — cloud 1:1s: where they are listed, how one is started
  and opened, and how the other person is named and pictured.
- [composer-links.md](./composer-links.md) — a URL typed into the composer shows as a link, and
  why the composer and the message view cannot disagree about what a link is.
