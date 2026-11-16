# ADR-0321: The mobile inbox is computed from the device's chat cache, through a notification index stored beside the rows

> Status: Accepted · Decided: 2026-11-16 · Implemented in part: decision 6 in
> `feat/app-wide-chat-catch-up` (`apps/web/src/app/runtime/ChatSyncRunner.tsx`,
> `apps/web/src/app/hooks/chatCatchUp.ts`); decisions 1, 2, 3 and 5 in `feat/inbox-from-chat-cache`
> (`libs/data/src/domain/chatNotificationEntries.ts`,
> `apps/web/src/app/features/notifications/utils/roomNotifications.ts`, `hooks/useNotificationFeed.ts`,
> `apps/web/src/app/utils/notifications/notificationOverlay.ts`), with decision 8's in-memory judging
> as the only path for every shell; decisions 4 and 7 (the stored index and its fill) are not
> implemented yet
> · Scope (planned): `libs/data/src/domain/` (a new judge, `chatNotificationEntries`, beside
> `chatMediaEntries`); `libs/data/src/local/data-sources/ChatLocalDataSource.ts` (entries on the chat
> write, the fill, the cross-room read); `libs/bridge-messages/src/types/model/cache.ts`;
> `libs/db/src/indexeddb/**` and `libs/db/src/native/NativeDBAdapter.ts`;
> `apps/mobile/src/app/database/sqlite/schema.ts` (a new migration) and `data/cache/ChatDataSource.ts`;
> `apps/web/src/app/hooks/useChatSyncRegistration.ts` (moved out of home);
> `apps/web/src/app/stores/useNotificationStore.ts`, `apps/web/src/app/utils/notifications/` and
> `apps/web/src/app/features/notifications/`
> · Amends: [ADR-0312](./0312-the-mobile-app-derives-its-notification-inbox-on-the-device-separately-from-desktop.md)
> — decision 1 (capture the newest message as a snapshot) and decision 5 (the snapshot store). Its
> decisions 2, 3 and 4 — the current place, the six kinds and their order, and a separate inbox from
> desktop's — stay.
> · Follows the pattern of [ADR-0316](./0316-a-room-media-index-is-judged-on-the-web-and-stored-beside-the-chat-rows.md)

## Context

ADR-0312 gave the mobile app a notification inbox derived on the device. It watches each room's channel
record, and when the record's `lastChat$` moves ahead it classifies that one message and stores a
snapshot of it. That shape has four costs:

- **A burst collapses to its last message.** Only the newest message of a background room is looked at,
  so the messages that arrived between two record updates are never classified.
- **Nothing that arrived while the app was closed gets in.** The first record seen after a launch is a
  baseline, not news.
- **A removed item can come back.** Removing deletes the snapshot, and the store's only duplicate guard
  is "an id already held". Today a message is looked at once, so this is rare; any change that looks at
  messages more than once — filling a gap, re-reading after a launch — would bring removed items back.
- **The snapshots are a second copy of the chat rows**, with their own cap and eviction, which can say
  something different from the room about the same message (an edit, a delete).

Meanwhile the chat cache already holds most of what the inbox misses. Home registers a `chat` sync
target for every room of the current place, so a `chat.sync` frame for any of them is written to the
cache as it arrives. A room whose polled head has run ahead of the cache gets its newest 30 messages
pulled, which also runs after a launch. The inbox reads none of this; it reads the channel record.

What the cache does not hold today:

- **Rooms while home is not mounted.** The `chat` registration belongs to the home page, which unmounts
  when the reader navigates away. While the reader is in a room or on the notifications tab, frames for
  other rooms are not written; the 30-message catch-up fills in when home mounts again.
- **The part of a gap past 30 messages.** A room that gained more than 30 while the reader was away
  keeps a hole below the newest page until the room is opened and scrolled.
- **Other places and other clouds.** Reading their rooms needs their session. This stays a limit.

The server keeps no notification list and does not work out who a message calls: its push step mutes
the members whose notify level is off and does not read the mention record. Computing the inbox on the
client, from the cache, is the goal of this decision; a server list stays possible later and is not
blocked by anything here.

ADR-0316 already settled how a fact about a chat row is indexed on this device: one judge on the web,
entries carried on the chat write, each store indexing them beside its rows, a fill on first read, and a
fallback for shells without the index.

## Decision

1. **The inbox is a query over the chat cache plus a small state overlay.** An item is a cached row that
   the existing rules (`classifyMessage`, `isMentioningViewer`, the room's notify level) file under one
   of the six kinds. Its text, author and room are read from the caches when it is drawn. There is no
   snapshot store; the ADR-0312 capture path is removed once this one is in.
2. **One judge on the web, independent of the viewer.** `chatNotificationEntries` in `@chatic/data`
   turns a row into entries, each a `kind` and a `ref`:

    | `kind`     | `ref`                                  | One entry per                                    |
    | ---------- | -------------------------------------- | ------------------------------------------------ |
    | `mention`  | a member id from `mention$.userIds`    | named member                                     |
    | `everyone` | empty                                  | row whose `mention$.all` is set                  |
    | `reply`    | the row's `parentId` (its thread root) | thread reply                                     |
    | `reaction` | the chat id the reaction targets       | reaction event, turning one on or off (`action`) |

    Every entry also carries the row's channel id, chat number, author, and the server's sent time
    (`createdAt`). Not the cached `createdAtMs`: that falls back to the device clock when the server
    time is missing, and two devices would order the same entries differently. A `reaction` entry also
    carries the emoji. The judge never asks who the viewer is: the ids a viewer is known by differ per
    cloud and per room, and some are learned after the row is cached, so an entry decided for one viewer
    would be wrong for the next and would have to be recomputed. Unsent, failed and deleted rows have no
    entries, and neither do system and join/leave rows — except reaction events, which are system rows.

3. **The viewer is applied at read time.** The viewer's ids in a room are the account id, the account's
   id in that cloud, and the member id the room's join row holds — the set capture uses today. The
   mention read asks for `mention` entries whose `ref` is in the union of those ids over the current
   place's rooms, plus `everyone`, newest first. Each candidate row is then checked with
   `isMentioningViewer` against its own room's ids, so the inbox applies the same mention-record rule as
   home's `@me` mark. A row with no mention record is not a mention, as today; the room's highlight still
   reads the text of such a row, and the inbox does not.
    - **Threads.** The threads the reader is part of are worked out from the cache, not from a separate
      record: a `reply` entry whose author is one of the viewer's ids marks its thread as one the
      reader replied in, and a thread whose root the reader wrote is found by walking `reply` entries by
      time and loading their roots together (`loadMany`). A root the cache does not hold is read from the
      server once per thread and remembered for the session, as capture does today. Replies are then
      read by `reply` and the thread's root.
    - **Reactions.** `reaction` entries are walked by time and folded per target, emoji and author: the
      newest event wins, so a reaction taken back leaves nothing. The targets are loaded together, and
      only those the reader wrote are kept. A target the cache does not hold is left out, as today.
    - **1:1s** need no entry: the existing room index pages a 1:1's rows above the read cursor.
    - **Place and window.** Every walk is bounded by the retention window on the sent time. The rooms of
      the current place are the ones `isInPlaceList` admits, and entries of other rooms are dropped
      after the read — apps/web caps no room, so other places' rows stay cached and the walk passes them.
4. **The entries ride on the chat write, in their own records.** `ChatLocalDataSource` attaches them to
   the merged row on every write, as it does `mediaEntries`, so an edit or a delete rewrites them in the
   same transaction — a mention removed by an edit leaves the inbox. Each store keeps three indexes over
   them:

    | Index                               | Serves                                                  |
    | ----------------------------------- | ------------------------------------------------------- |
    | `(cid, uid, kind, ref, created_at)` | a known `ref`: mentions by viewer id, replies by thread |
    | `(cid, uid, kind, created_at)`      | walks by kind: reactions, and replies to find my roots  |
    | `(cid, uid, channel_id, chat_no)`   | clearing a room and evicting under a room cap, by range |

    The shell gets a new table and the three indexes in a new migration; IndexedDB gets records of a new
    type in the same store and the same three indexes. Clearing a room, a scope, or everything names the
    new type wherever it names the media one.

5. **State is an overlay of exceptions, never a copy.** A persisted per-device map keyed by the item id
   (`<cloud>:<chat id>`, or the reaction key ADR-0312 defines) holds only what the rules cannot work out:

    | State      | Meaning                    | Shown                                   |
    | ---------- | -------------------------- | --------------------------------------- |
    | (none)     | follows its read point     | unread above the read point, read below |
    | `read`     | marked read by hand        | tabs only                               |
    | `unread`   | marked unread by hand      | tabs, badges, the find-me sheet         |
    | `archived` | dealt with, kept on record | an archive view only                    |
    | `deleted`  | removed                    | nowhere                                 |
    - **Read points.** A top-level item's read point is its room's read cursor, which is synced across
      devices. A thread item's read point is the thread's own: the overlay keeps, per thread root, the
      highest chat number read, written by the thread screen as it is today. The room's cursor never
      marks a thread item read.
    - **Pruning.** An overlay entry is dropped only once its item's sent time is past the retention
      window — never because its row left the cache. A row cleared and fetched again by the catch-up is
      computed again, and its `deleted` must still be there to hide it.

6. **The current place's rooms are kept in the cache, without holes.** The `chat` registration and the
   head catch-up move out of the home page into an app-wide runner for the current place, beside the
   `channel` registration the inbox already keeps. The catch-up keeps paging until it reaches rows the
   cache already holds, up to a bound per room. What lies past the bound stays a hole, as it is today.
   A room the cache holds nothing of gets its newest page only: it has no hole, only history, and
   walking every such room would pull the bound for each one on a fresh install.
    - **The newest page is 30 rows, asked on its own.** Sharing the room-feed call the room's entry
      uses would save an open room that is behind a second request, but that call asks for the
      server's default of 20, and a room opened on fewer than two screens of rows asks for an older
      page straight away. The 30 rows are what let a room open on its newest messages without one.
    - **Older pages are gated.** At most two run at a time across every room, so a long absence in a
      big place does not put every room's walk on the socket at once.
    - **The cache is read on a head move, not on a write.** The comparison point comes from the
      last-chat reading, taken once and closed. Held open it wakes on every chat write and re-reads
      every room's tail, which an app-wide hook would pay for each message in an open room.
    - **Two holes stay open.** One whose newest rows reached the cache before the head moved (a
      reconnect's own catch-up wrote them) leaves no head ahead to walk from, and a walk cut short by a
      switch or a failed page is not retried. The room pages both when it is opened. Remembering an
      unclosed range per room would close them; it is not done yet.

7. **Rows cached before the index are filled once per room, entries only.** As with the media index, a
   room with no fill mark has its cached rows read, their entries computed and handed to the store
   without rewriting any row, guarded by `CHAT_NOTIFICATION_ENTRIES_VERSION`. The inbox reads across
   rooms, so its first read after an update fills every room of the current place that has no mark: one
   whole-place pass over the cached rows, the cost of the fallback path below, paid once per room and
   rules version. Where a room needs both fills, one pass over its rows serves both.
8. **A shell without the index is answered from plain rows.** The page asks the handshake's
   `supportedWebMessages` on every call. Without the new messages, the inbox reads each room of the
   current place newest first down to the retention window and judges the rows in memory with the same
   judge: the same answer within that window, slower, and no fill.

## Not decided here

These are settled when the implementation lands, from measurements on a device:

- the catch-up's bound per room (decision 6) — it ships at five older pages of 50 after the newest
  page of 30, 280 messages in all, two older pages in flight at a time, with no measurement behind the
  numbers yet; a device measurement of how far rooms fall behind is what should move them;
- the retention window, which bounds every walk and the overlay — it ships at 14 days by sent time,
  over each room's newest 200 cached rows, again with no measurement behind the numbers;
- whether the archive view ships with the first change or the state only — neither shipped with the
  first change: the overlay holds `read` and `deleted`, and `archived` and an explicit `unread` wait
  for the screen that sets them;
- the numbers: the shell migration, the IndexedDB version and the bridge minor are whatever is next
  when the change merges.

## Alternatives

- **Keep capturing snapshots and add gap filling to the capture.** It closes bursts and launches without
  a schema change. Rejected: it keeps a second copy of every item next to the cache, with its own
  eviction and its own answer to edits and deletes, and every gap fill risks bringing removed items back
  unless the store grows tombstones — which is the overlay of decision 5 with a copy attached.
- **Scan the place's rooms in memory at every launch, with no index.** No schema and no bridge change.
  Rejected as the main path: the cost grows with the cached history of every room in the place and is
  paid on every launch and place switch. It stays as the fallback for older shells (decision 8), bounded
  by the retention window, and it is what the one-time fill costs (decision 7).
- **Judge per viewer, storing only "mentions me".** A smaller index and a one-step read. Rejected: the
  viewer's ids differ by cloud and room and are sometimes learned after the row is cached, so the stored
  answer goes stale with nothing to tell the store; and the rule would split from `isMentioningViewer`.
- **Put the entries in the media table.** One table, one fill. Rejected: that index starts with the
  room, which is right for a room's files and wrong for an inbox ordered across rooms, and every media
  count would have to filter out kinds it never shows.
- **Keep ADR-0312's thread participation record.** Rejected: only the capture path writes it, and that
  path goes. The cache holds the reader's replies, which is the same fact without a second store.
- **A server notification list.** It would cover other places, other devices and the time the app was
  closed. Not chosen now: this work is client-side by intent, and the server does not work out mention
  targets today. Nothing here prevents moving the overlay and the kinds to a server later; the item id
  and the states are already in the shape such a list would take.

## Consequences

- **Bursts and launches are covered within the catch-up bound.** What the cache holds for the current
  place is what the inbox can show. Other places and other clouds are still not watched, and a room that
  gained more than the bound while the reader was away still loses the older part.
- **Items follow the rows.** An edited message changes its items, a deleted one loses them, and a row
  that leaves the cache (a cache clear, a sign-out) takes its items with it. A reaction follows its
  newest event, so taking it back removes the item.
- **Removing an item is permanent on this device for the retention window**, because the overlay is
  consulted after every computation and kept by sent time, not by whether the row is cached. It is still
  per device: another device of the same account has its own overlay. Top-level read state follows the
  synced room cursor, so it agrees across devices; thread read state is per device, as it is today.
- **The judge is schema.** Changing what `chatNotificationEntries` answers for a row already answered
  requires raising `CHAT_NOTIFICATION_ENTRIES_VERSION`, which refills every room on its next read. The
  kind names, the table and index names and the IndexedDB key shape cannot change without a migration.
- **A shell update and a bridge minor are needed.** Until a phone has the new shell, its inbox comes from
  the plain-row path, which is slower on a large place. On the new shell, the first open after the update
  pays one whole-place fill.
- **The app-wide `chat` registration costs what home's already does**, on every route rather than only on
  home: one target per room of the current place, merged with home's and the open room's by the sync
  engine. What home also ran — a last-chat observation that re-reads every room on every chat write —
  is not carried along: the app-wide hook reads once per head move instead.
- **Desktop stores the entries but does not read them.** The judge runs in the shared chat write path,
  so desktop's IndexedDB keeps the records and evicts them with the rows under its per-room cap. Its
  inbox stays as ADR-0312 left it, and it can adopt the index later.
