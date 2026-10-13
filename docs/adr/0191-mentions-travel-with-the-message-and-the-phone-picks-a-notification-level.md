# ADR-0191: Mentions travel with the message as picked ids, and the phone picks a notification level

> Status: Accepted · Decided: 2026-10-13 · Implemented: `feat/channel-notify-mode`
> · Scope: `libs/data/src/domain/mention.ts` · `libs/data` `ChatRepository` (send and pending image rows)
> · `libs/app-runtime` `sendChatInCloud` and `useSendImages` (`mention`) · `apps/web/src/app/features/channels/`
> (`useMentionComposer`, `MentionSuggestions`, `NotifyModeSheet`, `MessageText`, `ChannelMessageRow`,
> the room and thread pages, `ChannelSettingsPage`)
> · Partially supersedes [ADR-0025](./0025-channel-notification-mute-toggle.md) (its on/off switch and the
> out-of-scope `notify = 'mention'`)
> · The module docs are [apps/web channels/chat-room.md](../../apps/web/docs/feature/channels/chat-room.md)
> (§ Mentions, § A message row), [channels/channel-settings.md](../../apps/web/docs/feature/channels/channel-settings.md)
> (§ The notification level) and [libs/data repositories/domains.md](../../libs/data/docs/repositories/domains.md)

## Context

A room's notification setting on my join row has three values the server stores — all messages,
mentions only, off — and until now the push path honoured only "off". A member who chose "mentions
only" on the desktop got every message on the phone. The phone could not choose it at all: its
settings row was an on/off switch, and switching it off and on again wrote `all` over a `mention`
chosen elsewhere.

Nothing in a message said who it called. The desktop composer knows the person the moment they are
picked from its `@` list, but writes only the text `@name`, so every "did this mention me" check had
to guess from the text. The desktop's own check is a case-insensitive substring match on the reader's
names, which reads `ops@here.io` as `@here` (everyone), lets a short name match a longer one (`@Min`
inside `@Minsu`), cannot tell two people with the same name apart, and misses a mention made by a
name the reader has since changed. A server repeating that match would have repeated those mistakes on
every phone.

The chats service now takes, on `chat.send`, a `mention { userIds, all }` beside the text: it keeps the
ids that are members of the room, only for a user's message, as the message's `mention$`, returns it
on reads and in `chat.sync`, and pushes a "mentions only" member only when `mention$` calls everyone or
names them. It never reads the text. It treats "mentions only" in a 1:1 as all messages, since every
message of a 1:1 is addressed to the other person.

## Decision

1. **A mention is what the sender picked, carried with the message.** The composer remembers who each
   picked `@name` means, and at the send the picks whose `@name` is still in the text go out as
   `mention`. An `@name` typed by hand, a name deleted before the send, and an e-mail address call
   nobody. Everyone is a row in the list (writing `@channel`), not a word read out of the text.
2. **Every "did this call me" check reads `mention$`.** The phone's louder mark for a mention of me
   uses the same rule as the push (`isMentioningViewer`, in `libs/data` so the desktop can take it
   next): everyone, or one of the reader's ids — the room-cloud uid and the account uid, because the
   record holds the room's member ids — on someone else's message. Separately, every member's `@name`
   and every everyone word in a group room is drawn as a mention on any message — coloured text, with
   a tap on a member's opening their profile: that says how the text is written, not whom it calls,
   so it may read the text.
3. **The phone's composer gets the `@` list,** inside the composer bar right above the field, in group
   rooms only. A 1:1 always notifies and has one person to call; a self chat has nobody. Typing `@` at
   the start of a word opens it. A backspace at the end of a picked name takes the whole name and the
   pick with it, as a mention chip would go.
4. **The phone's settings row offers levels**: all · mentions only · off in a group, all · off in a
   1:1. A 1:1 stored as `mention` shows as "All messages", how it is delivered, and is not rewritten.
   The home list's swipe stays an off/all toggle and draws only "off" as muted; a room on "mentions
   only" shows an @ glyph beside its name, and an unread last message that calls me leads its preview
   with "@me", by the same record.
5. **A mention survives a failed send.** The optimistic row keeps it as `mention$`, a resend rebuilt
   from the row sends it again, and an image message's pending row keeps it with its text.
6. **The send type is widened locally.** The socket SDK's `ChatSendInput` does not declare `mention`
   yet; `ChatSendPayload` adds it, and the payload reaches the socket unchanged.

## Consequences

- A phone set to "mentions only" is woken only by messages that really call its user, and the
  highlight on the phone agrees with that push for the same message.
- Mentions typed by hand, from an older client, or in a webhook call nobody. A room on "mentions
  only" gets no webhook alarm; a room that should ring for them is set to all messages.
- The picks are not part of the persisted draft. Leaving a conversation keeps its text but forgets
  who its names meant, so a draft sent later calls nobody.
- Editing a message does not change its `mention$`.
- Until the socket service forwards `mention` on `chat.send`, a mention sent from the phone stops
  there: the message still goes, calling nobody. Nothing in the app has to change when it starts
  forwarding.
- The desktop's composer sends no `mention` yet, so a mention written on the desktop calls nobody,
  and a phone on "mentions only" is not woken by it.
- The desktop still judges mentions by text; moving it onto `mention$` is the next step, and the
  shared predicate is already where it can reach it.

## Alternatives

- **Keep judging by the text, on the server too.** One rule for every device with no new field, but
  the server would inherit every false positive above and need to look up each reader's names on
  every message. Rejected for the false positives listed in Context, which a server match would repeat
  on every phone.
- **Ids and the text together** (a mention if either says so). It would keep a hand-typed `@name`
  working, and the e-mail and prefix problems with it. Rejected; only a pick calls someone.
- **Keep the picks in the persisted draft store.** A draft would then still call its people after a
  restart, at the cost of storing member ids beside every unsent text for a case that is rare and
  costs only the call. Not done for now.
- **Pick from a bottom sheet** instead of a list above the field. A sheet takes the keyboard away
  while the name is still being typed; the list inside the composer bar keeps it up and rides with it.
- **An `@` button beside the attach button** that writes the `@` and opens the same list. Tried on a
  device and left out: typing `@` is the way in, as on the desktop, and the composer's row stays the
  attach button's.
- **Offer "mentions only" in a 1:1 too.** It would behave exactly like all messages, since the server
  delivers every 1:1 message. Rejected as a choice that changes nothing.
