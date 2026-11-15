# ADR-0316: A room's media index is judged once on the web and stored beside the chat rows it came from

> Status: Accepted · Decided: 2026-11-15 · Implemented: `feat/room-media-index`
> · Scope: `libs/data/src/domain/chatMediaEntries.ts` (the judge) and `messageTokens.ts` (moved from
> `apps/web`); `libs/data/src/local/data-sources/ChatLocalDataSource.ts` (`listRoomMedia`,
> `countRoomMedia`, filling a room, the plain-row path) and `chatMediaIndexMarks.ts`;
> `libs/bridge-messages/src/types/model/cache.ts` (`ChatMediaEntry`, `CacheChatView.mediaEntries`,
> `FetchChatMediaCacheData`, `CountChatMediaCacheData`); `libs/db/src/indexeddb/**` (`ChaticWebCacheDB`
> v4, `chatmedia` records) and `libs/db/src/native/NativeDBAdapter.ts`;
> `libs/runtime-web/src/localCache/` (`isNativeCacheMessageHandled`); `libs/runtime-mobile/src/localCache.ts`;
> `apps/mobile/src/app/database/sqlite/schema.ts` (migration 12), `data/cache/ChatDataSource.ts`,
> `services/cache/`; `libs/bridges/src/version.ts` (2.25.0)
> · The behaviour is documented in [libs/data docs/local](../../libs/data/docs/local/README.md#room-media-index),
> [libs/db](../../libs/db/README.md), [apps/mobile docs/storage/cache.md](../../apps/mobile/docs/storage/cache.md)
> and [libs/runtime-web docs/cache](../../libs/runtime-web/docs/cache/README.md)

## Context

The phone's room files screen lists one kind of a room's attachments or links newest first, with a
count per kind. The only source is this device's cache of the room's messages — there is no server
query for it, and none is being added. Finding the media meant reading every cached message of the
room and deciding, message by message, what it holds.

Three things make that decision harder than it looks. What a link is must match what the message
bubble draws as one — an address inside a code span is not a link. The cache lives in two stores, the
phone shell's SQLite and the browser's IndexedDB, and the same room must answer the same in both.
And the shell is a store build that ships after the web, so for a while a new web runs inside shells
that know nothing of an index.

## Decision

1. **One judge, on the web.** `chatMediaEntries` in `@chatic/data` turns a message into entries —
   `image`, `video`, `file`, `audio`, `link`, each with an `idx` (the attachment's `upload$$` position,
   or the slot count plus the link's order) and a `ref` (the upload id, or the URL). Links are read
   with the bubble's own tokenizer, which moved from `apps/web` into `@chatic/data` whole rather than
   as two copied patterns, so the code-span rule cannot drift. Unsent, failed, deleted, system and
   event rows have no entries; a thread reply counts in its room; one URL counts once per message.
   Neither store decides a kind.
2. **The entries ride on the chat write.** `ChatLocalDataSource` attaches `mediaEntries` to the merged
   row on every write, so an edit, a delete mark and a re-sent copy rewrite the entries with the row,
   in the same transaction. A store reads a list as "replace", an empty list as "remove", and an
   absent field as "leave alone" — the last is a row an older web bundle wrote.
3. **Each store indexes beside its chat rows.** The shell gets a `chat_media` table with
   `(cid, uid, channel_id, kind, chat_no DESC, idx)` in migration 12, which also restores the room's
   newest-first chat index that migration 4 lost. IndexedDB gets `chatmedia` records in the same store
   and a `chat_media_index` in version 4; an entry's key separates the chat id from `idx` with NUL,
   since a chat id can contain `:`. The entries are never routed apart from the chat rows.
4. **Three messages, sent only to a shell that lists all three.** `FetchChatMediaCacheData` and
   `CountChatMediaCacheData` read `chat_media`; `SaveChatMediaCacheData` fills it. The page asks the
   handshake's `supportedWebMessages` on every call, not once, because the reply can land after the
   storage is built. A shell without them, or a read that fails, is answered from plain chat rows
   through the same judge: the same page and counts, slower, and no fill. Bridge 2.25.0.
5. **A room is filled on its first read, once, with entries only.** Messages cached before the index
   have no entries, so the first `listRoomMedia` / `countRoomMedia` of a room reads its cached rows,
   computes their entries and hands them to the store's `saveChatMediaEntries` — never writing a row.
   The write path stamps `mediaEntriesVersion` beside `mediaEntries`, and the store applies a fill item
   only while the message's row still exists with a lower version, checked in the same transaction.
   Then the room gets a mark in the `meta` cache, named with `CHAT_MEDIA_ENTRIES_VERSION`. The mark has
   no age — it ignores the `meta` TTL — and stays valid while the routing fingerprint is the same and
   no cache clear came after it. Raising the version refills every room.
6. **A page never splits a message.** The cursor is one message number, so a page runs past its limit
   by the rest of the message the limit landed in.

## Alternatives

- **A new cache type, `chatmedia`, with its own contract edition (ADR-0053).** The edition would say
  exactly whether the shell's migration ran. But a cache type is routed on its own: in an older shell
  `chatmedia` would land in IndexedDB while the chats stayed in SQLite, and the two would diverge.
  Stopping that needs a routing exception, plus save, read and delete arms for a domain nobody writes
  directly. Dropped.
- **A `mediaKind` option on the existing chat query.** An older shell ignores options it does not
  know and answers a plain page, so the answer alone cannot tell whether the filter applied — the
  handshake is needed anyway — and counting still needs a message of its own. Dropped.
- **Judging in each store.** The shell would carry a copy of the attachment and link rules, the
  tokenizer included, and an app build behind the web would judge by older rules. The web already has
  the rule and every write passes through it. Dropped.
- **Only the plain-row path, no index.** Correct everywhere and no schema, but a count reads the
  whole room across the bridge every time the screen opens. Kept only as the path for shells without
  the index.
- **The fill mark in the page's `localStorage`.** Clearing the shell's database would leave a mark
  claiming a room was filled over an empty table. The `meta` cache is cleared with the data it
  describes. Dropped.
- **Reading the mark like a sync cursor.** `getSyncedAt` retires a cursor after the 30-minute `meta`
  TTL, which would refill every room every half hour. The mark gets its own read instead.
- **A key separator of `:` for IndexedDB entries.** The range for message `x:12` would also cover the
  entries of message `x:12:7`, reproduced in a scratch database. NUL sorts below every id character.
- **Filling by rewriting the rows through the ordinary write.** The first implementation did this,
  so entries would come from the one write every message takes. Review found two regressions. Every
  store stamps a row's cache time on save, and the room's page skips re-checking rows stamped during
  the current run, so a room's older blocks stopped being re-checked once its media was read. And the
  copy written back was the one read, so a delete mark (which keeps the row's server time), a delete or
  a clear landing in between was undone. Dropped for the entries-only fill.
- **Guarding the fill by the row's server time.** A delete mark this device infers keeps the cached
  copy's `updatedAtMs`, so a time comparison cannot see it. The rules version can: any write since the
  fill's read stamps the current one.
- **An `observeRoomMedia` stream.** The room's existing chat list subscription already wakes on every
  write that can change the media; a consumer reads again then. A third API was not worth its keys.

## Consequences

- A new shell running an older web bundle receives rows without `mediaEntries`, so an edit made in
  that window leaves the message's entries as they were. The web normally ships first, so the window
  is short; it is accepted rather than fixed by raising the version.
- After a shell update the table is empty, and each room is filled the first time its media is read.
  That first read carries every cached row across the bridge once and its entries back once. On the
  iOS simulator a 10,000-row room took about 0.5 s (1,000 rows about 60 ms); a phone was not measured.
- A filled row keeps no `mediaEntriesVersion` of its own, so a refill (a routing change, a cache clear,
  a rules bump) sends such rows again; the guard lets them through, which lands on the same entries.
- The IndexedDB cap eviction removes the evicted messages' entries by the same channel and
  message-number bound it removes the rows by.
- Counts and pages describe this device's cache, not the room on the server; `nextCursorNo: null` says
  only that nothing more is cached.
- `chatMediaEntries` is now schema: changing what it answers for a row already answered requires
  raising `CHAT_MEDIA_ENTRIES_VERSION`, which refills every room on its next read. The kind names, the
  `idx` rule, the table and index names and the IndexedDB key shape cannot change without a migration.
