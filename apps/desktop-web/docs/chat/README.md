# chat

The home screen's conversation surfaces: the sidebar's channel and direct-message lists, the room
(`ChatPane`), and the composer. The code lives in `src/app/features/chat/`, with shared hooks and
stores in `src/app/shared/`.

## Documents

- [direct-messages.md](./direct-messages.md) — cloud 1:1s: where they are listed, how one is started
  and opened, and how the other person is named and pictured.
- [composer-links.md](./composer-links.md) — a URL typed into the composer shows as a link, and
  why the composer and the message view cannot disagree about what a link is.
- [jump-and-return.md](./jump-and-return.md): a jump to one message, and the "Back to …" that returns
  the reader to where they were reading.
- [room-names.md](./room-names.md): one name per room on every surface, and the profile cache behind it.
- [images.md](./images.md): adding images, the tray, tiles and their states, the viewer, and image
  previews in the sidebar and notifications.
- [onboarding.md](./onboarding.md): the first-run welcome, shown once per account, the Self Channel
  row it waits on, and tips that match what the account has.
- [threads.md](./threads.md): how the thread panel gets a root and replies that are older than the loaded
  window, and what it shows while it cannot.
- [keyboard.md](./keyboard.md): the feed's single tab stop, hover-revealed controls, which layer owns a
  key, focus on open and close, and the next-unread shortcut.
