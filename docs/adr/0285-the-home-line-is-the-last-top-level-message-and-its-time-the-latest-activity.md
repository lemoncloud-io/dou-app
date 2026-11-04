# ADR-0285: The home line is the room's last top-level message, its time and order the latest activity

> Status: Accepted · Decided: 2026-11-04
> Scope: `libs/data/src/domain/chatPreview.ts` (`isPreviewableChat`, `isActivityChat`,
> `DomainLastChat`) · `apps/mobile/src/app/data/cache/ChatDataSource.ts` (`PREVIEWABLE_SQL`,
> `ACTIVITY_SQL`) · `apps/web/src/app/hooks/useLastChats.ts`
> Supersedes: [ADR-0242](./0242-a-thread-reply-can-stand-as-a-rooms-home-preview.md) — a thread reply
> no longer stands as a room's home line. Its goal, that a busy thread keeps its room near the top, is
> kept through the time and order. The writer's name on a group row (its decision 3) stays.

## Context

ADR-0242 let a thread reply be a room's last message on the home list, behind a `[스레드]` mark, so a
room whose conversation had moved into a thread would rise in the list. In use it sent readers to a
dead end: the row printed a line that the room's feed does not contain, because the feed leaves
replies to the thread page, and tapping the row opened the room with no way to see what the row had
promised. People noticed the mark and went looking for the reply in the room.

The need behind ADR-0242 was real, though: a room whose conversation lives in a thread should not sink
down the list. That needs the room's activity, not the line it prints.

## Decision

1. **A room has two last messages.** `DomainLastChat.chat` is the newest message the room's feed
   shows: `isPreviewableChat` rejects any chat with a `parentId`, alongside reaction events, system
   rows and failed sends, and tombstones still count. `DomainLastChat.activity` is the newest message
   anywhere in the room, a thread reply included: `isActivityChat` is the same rule without the reply
   exclusion, so `activity` is `chat` or newer.
2. **The row prints `chat` and takes its time and order from `activity`.** On web the two are
   `useLastChats` and `useLastActivities`, over one shared observation. Home and place channel
   management print the activity's time and sort by it.
3. **The native SQL mirror answers both** (`ACTIVITY_SQL`, `PREVIEWABLE_SQL`) through a new optional
   `LastChatItem.activityItem`. The activity row is probed first; the preview row costs a second pair
   of probes only when the activity row is a reply.
4. **The sender name on a group row stays**, and so does the unread count, which already counts every
   row kind.

## Alternatives

- **One row per thread.** It would let a thread carry its own unread count, but needs a server-side
  read position per thread, which does not exist.
- **Keep replies in the line and open the thread when the row's last message is one.** Fixes the dead
  end, but the row's tap target then depends on the last message, and the room's own unread top-level
  messages are skipped past.
- **Drop replies from the order too.** The simplest rule, but a room that is busy only inside a thread
  would sink, which is the mismatch ADR-0242 set out to remove.

## Consequences

- A reply in a thread moves its room up the list and refreshes the time, while the line stays on an
  older message. The time can therefore be newer than the line beside it. The unread badge counts
  replies as before.
- An older native app answers without `activityItem`, or with a reply as the preview. The web's
  re-validation sends that channel through the windowed read, which computes both rows, so the old app
  shows the right line and time at the cost of the slower path until it updates.
- `apps/desktop-web` keeps its behavior. Its Channels and DM lists read `DomainLastChat.activity`
  instead of `chat`, which is exactly what the preview was under ADR-0242: they still print a thread
  reply behind its mark, order by it, and open its thread when the row is picked. Its Home sidebar
  already kept its own copy of the rule.
- `lastChatPreview`'s thread mark is likewise left in place as a guard.
