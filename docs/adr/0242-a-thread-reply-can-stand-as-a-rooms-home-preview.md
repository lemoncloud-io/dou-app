# ADR-0242: A thread reply can stand as a room's home preview

> Status: Accepted · Decided: 2026-10-27
> Scope: `libs/data/src/domain/chatPreview.ts` (`isPreviewableChat`) ·
> `apps/web/src/app/features/channels/utils/lastChatPreview.ts` ·
> `apps/web/src/app/features/home/hooks/useLastChatSenders.ts` ·
> `apps/mobile/src/app/data/cache/ChatDataSource.ts` (`PREVIEWABLE_SQL`)
> Supersedes: the "thread replies cannot be previews" part of the preview classification that
> [ADR-0057](./0057-home-last-chat-preview-single-query.md) and
> [ADR-0047](./0047-web-reaction-and-thread-refinements.md) carried over. Reaction events, system rows
> and failed sends still never preview; tombstones still do.

## Context

The home list prints each room's last message under its name and orders the rooms by it. Until now a
thread reply could not be that message: the preview took the feed's rule, and the feed leaves replies
to the thread page. A room whose conversation had moved into a thread therefore kept showing the
message the thread hung off, with its old time, and sank down the list while it was the busiest room.

The product requirements now describe the row as the room's last activity: a reply previews behind a
`[스레드]` mark, and a group room's line names who wrote it (`보낸 사람 : 내용`). The requirement can be
read as one row per thread as well, but that needs a read position per thread, which the server does
not keep.

## Decision

1. **`isPreviewableChat` admits thread replies.** It keeps the feed's reaction rule and drops its
   reply rule. The rule lives in `libs/data`, so the home list, global search and place channel
   management change together.
2. **One row per room, with a mark.** `lastChatPreview` puts `chat.preview.thread` in front of a
   reply's line, so it does not read as a message in the room itself.
3. **A group row names the writer** through `chat.preview.sender`. The name is this place's profile
   nick, then the name the chat row carries — the room's own order without its member cache, which
   costs a request per room. Every writer on the list is read through one profile subscription. A
   writer with neither name prints no name rather than a label, and a 1:1 or self chat prints none.
4. **The unread count is untouched.** `lastNo` already counts every row kind.

## Alternatives

- **A row per thread.** It is what one reading of the requirement describes, and it would let a
  thread carry its own unread count. It needs a server-side read position per thread, so it is left
  for when one exists.
- **Keep replies out and only refresh the time.** The room would rise in the list but print a line
  that is not its last activity, which is the mismatch the change exists to remove.
- **Name writers through the member cache, as the room does.** Exact parity with the room, at one
  `syncChannelUsers` call per visible group room, on a screen that otherwise makes no request to
  render.

## Consequences

- On the native app the preview is first picked in SQL by a mirror of this rule
  (`PREVIEWABLE_SQL`), which admits replies in the same change. The mirror ships in the mobile JS
  bundle, and the web's re-validation only catches a mirror that is too loose: an app still on the
  old one answers with an older top-level message, which passes, so it keeps the old preview until
  it is updated.
- A reply now moves its room up the home list, since the order is the same value the row prints.
- Search and channel management print the thread mark but no writer.
- `apps/desktop-web` keeps its own copy of the preview rule (`previewChat.ts`) and is outside this
  change, so the desktop list still previews the last top-level message: the same room can lead with
  a reply on the phone and with the message before it on the desktop.
