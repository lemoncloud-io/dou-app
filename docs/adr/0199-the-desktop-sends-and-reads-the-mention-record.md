# ADR-0199: The desktop sends and reads the mention record, and keeps its notify level as a mirror of the join cache

> Status: Accepted · Decided: 2026-10-13 · Implemented: `feat/desktop-mention-parity`
> · Follows [ADR-0191](./0191-mentions-travel-with-the-message-and-the-phone-picks-a-notification-level.md),
> which left both halves of this to the desktop ("the desktop's composer sends no `mention` yet", "the
> desktop still judges mentions by text")
> · Scope: `apps/desktop-web` — `features/chat/components/editor/` (`MentionNode`, `MentionsPlugin`,
> `wireMarkdown.$collectMention`), `Composer`, `useComposerSend`, `shared/hooks/useChatOutbox`
> (`toSendPayload`), `shared/utils/mentionMatch` (`mentionsMe`), `useDesktopNotifications`,
> `useCrossCloudPushNotifications`, `useMentionCapture`, `MessageList`, `shared/stores/useNotificationPrefsStore`,
> `shared/stores/useMentionsStore`, `ChannelList`. No change to `libs/*`, `apps/web` or the server
> · The module docs are [desktop-web chat/composer.md](../../apps/desktop-web/docs/chat/composer.md) (§ Mentions)
> and [chat/channel-settings.md](../../apps/desktop-web/docs/chat/channel-settings.md) (§ Sections)

## Context

ADR-0191 made a message carry who its sender picked (`mention` on the send, `mention$` on the stored
message), and made the server go by that record alone when it decides who a "mentions only" member is
pushed. The phone shipped both sides. The desktop did neither: a mention written there called nobody,
and a mention read there was still a substring match of the reader's name against the text — so a
member the phone's list showed under a place nick was not called on the desktop, and someone else of
the same name was.

The notification level had the same split. The phone reads the level from the join; the desktop
resolved it as "this device's stored value, then the join's, then the old mute list", with a
shell-only effect that copied a join change into the stored value.

## Decision

1. **A pick lives on the chip.** `MentionNode` holds the id (or "everyone") it was picked with, together
   with the text it had at that moment, and answers with it only while the text is unchanged. The send
   collects the chips still in the document. A second list kept beside the editor, as the phone's
   composer has, would have to follow every edit, undo and paste the editor already tracks.
2. **Only a pick counts.** A name typed by hand, a chip restored from a draft, and the box that edits a
   sent message carry no id. An edit does not change who was mentioned: the server does not take one.
3. **"Everyone" is the first row of a group channel's list**, labelled with the app language's word
   (`@all` / `@전체`) as on the phone. With letters typed, people come first and the row is offered only
   when the letters begin its word, so `@al` + Enter still picks Alice.
4. **A resend keeps the mention.** The failed row holds the record; Retry and the reconnect sweep both
   rebuild the payload through `toSendPayload`.
5. **The record is the answer when a message has one** (`mentionsMe`): the banner in a mentions-only
   channel, the mentions inbox and the self highlight go by `mention$` and the reader's two ids (account
   id, and the id the channel's cloud gave them). A message with no record is read by its text as
   before. A cross-cloud push for a channel the server holds as mentions-only is not filtered a second
   time by its text: the server already sent it only to those the record names.
6. **The reading order of the notify level stays "this device, then the join".** The plan was to put the
   join first. The value the desktop can read at every call site is the one inline on the channel
   record, and that is a separate record from the join cache: a level just changed here is written to
   the join cache at once but stays old on the channel record until the record arrives again, so
   "join first" would snap the control back to the old level. The stored value is instead kept as a
   mirror of the join cache — the effect now finds my join by my id in the channel's cloud (it looked
   by account id only, and so never matched outside the relay) and runs in a browser too.
7. **A 1:1 has no "mentions only", and a 1:1 is `stereo: 'dm'`.** That is the server's test when it
   filters a push, and the phone's. A two-person channel with no name is drawn as a 1:1 on the desktop
   but is a group channel to the server, so the level works there and is offered. A 1:1 stored as
   "mentions only" reads as all; the stored value is left alone.
8. **The channel list tells mentions-only from off**, and an unread row says when one of its unread
   messages called me. That mark is read from the mentions inbox for that channel and place, not from
   the channel's last message: a row does not subscribe to its last message until it is pointed at, and
   the newest message is not the only one that can have called me.

## Consequences

- A mention written on the desktop now reaches a "mentions only" member, and one written on the phone
  is read on the desktop by the record.
- The level follows another device only as far as the join cache does. Whether a change made while the
  desktop was closed reaches the join cache at the next start was not checked on a device.
- A write of the level the server refuses now puts the previous level back when the join had one (the
  outbox of [ADR-0193](./0193-state-writes-go-local-first-and-through-an-outbox.md) restores the join
  and the mirror follows); the refusal is still announced.
- The banner and the inbox read the record off the channel's latest message as the feed delivers it.
  Whether that feed always carries `mention$` was not checked on a device; where it does not, those two
  fall back to the text, as before this change. The self highlight reads the full message and is not
  affected.
- The "mentioned you" mark uses this device's read cursor and the cursor on the channel record. Just
  after a start, with a stale channel record and something new unread, a mention already read can be
  marked until it is opened from the inbox. The inbox holds a place id but no cloud id, so two clouds
  with the same place and channel ids are not told apart.
- A chip pasted into another channel's composer keeps its pick. What the server does with an id that is
  not a member there was not checked.

## Alternatives considered

- **Read the level join-first from the channel record** — rejected for the snap-back above.
- **Join-first only when the two differ and no write is in flight** — the same stale value still wins
  once the write has settled and the channel record has not come again.
- **Treat the desktop's drawn 1:1 (a nameless two-person channel) as a 1:1 for the level** — the server
  filters those by mention, so hiding the level there would remove one that works.
- **Decide the "mentioned you" mark from the channel's last message, as the phone's home list does** —
  the desktop row keeps that subscription off until hover, on purpose.
