# chat

The home screen's conversation surfaces: the sidebar's channel and direct-message lists, the room
(`ChatPane`), and the composer. The code lives in `src/app/features/chat/`, with shared hooks and
stores in `src/app/shared/`.

## Documents

- [direct-messages.md](./direct-messages.md) — cloud 1:1s: where they are listed, how one is started
  and opened, and how the other person is named and pictured.
- [composer.md](./composer.md) — the composer's three rows, and how a code block is opened, left and
  pasted when Enter sends.
- [composer-links.md](./composer-links.md) — a URL typed into the composer shows as a link, and
  why the composer and the message view cannot disagree about what a link is.
- [feed-windowing.md](./feed-windowing.md): which feed rows are mounted, how the reading position
  holds while rows are measured, how a jump reaches a row outside the window, and how older history is
  paged past deleted messages.
- [jump-and-return.md](./jump-and-return.md): a jump to one message, and the "Back to …" that returns
  the reader to where they were reading.
- [read-receipts.md](./read-receipts.md): the "Seen by" line under a message, what it counts and which
  messages show one.
- [room-names.md](./room-names.md): one name per room on every surface, and the profile cache behind it.
- [channel-settings.md](./channel-settings.md): the channel settings panel's sections, and the channel
  ID a group channel shows for pointing a service at it.
- [images.md](./images.md): adding images, the tray, tiles and their states, the viewer, and image
  previews in the sidebar and notifications.
- [onboarding.md](./onboarding.md): the first-run welcome, shown once per account, the Self Channel
  row it waits on, tips that match what the account has, and the welcome page of an empty place.
- [inbox.md](./inbox.md): the device-local inbox — the five kinds it captures (mentions, 1:1 messages,
  replies in my threads, reactions to mine), one item per message, and who reads which kind.
- [lists.md](./lists.md): the Channels and DM destinations' lists — what a row shows, who a DM row
  names, their order, and the one cache observation their previews come from.
- [saved.md](./saved.md): Save for later — what a saved item keeps, the Saved items page and its
  filters, and what closes it.
- [my-threads.md](./my-threads.md): the device's record of my threads, which the inbox's Threads tab
  reads — which threads it holds, the three ways one gets in, and what it cannot know.
- [threads.md](./threads.md): how the thread panel gets a root and replies that are older than the loaded
  window, and what it shows while it cannot.
- [keyboard.md](./keyboard.md): the feed's single tab stop, hover-revealed controls, which layer owns a
  key, focus on open and close, and the next-unread shortcut.
- [message-editing.md](./message-editing.md): the editor a message opens in, and why the wire string carries no
  escapes.
- [webhook-messages.md](./webhook-messages.md): how a message posted by an integration looks (the
  card, the app badge and the sender's name), and how notifications, unread counts and previews treat it.
- [notifications.md](./notifications.md): the OS banner's title for a mention, what the title promises,
  and how a push from another cloud or the relay is shown and opened.
