# Local cache

Source: `cache.ts`. See the [index](./README.md) for conventions. The phone shell keeps a SQLite copy of
server data (the web's own IndexedDB is the other store); these messages read and write it. Every cache
message carries `cacheType` (one of `channel`, `chat`, `user`, `join`, `site`, `invitecloud`, `profile`, `meta`,
`invite`) plus the `cid` / `uid` partition. Which domain goes to which engine is the runtime's decision, and
the negotiation lives in [runtime-hybrid-web's cache doc](../../../runtime-hybrid-web/docs/cache/README.md).

`CacheDomainVersions` is a per-domain contract version, `Partial<Record<CacheType, number>>`. The app reports
the version it **implements**, the web the one it **requires**, each independently; only the type is shared,
never a constant, so the handshake stays a negotiation. Versions only go up and are unrelated to the SQLite
schema number or to when a domain was added.

Failure convention shared by the read handlers: `items: null` (or `item`/`counts` null where noted) is a
native processing error. The web then falls back for that one read only, so it is not "empty".

## Generic CRUD

- **`FetchCacheData`** (web→native) — one row by `id`; `item` is `null` when not found.
- **`FetchManyCacheData`** — rows for a list of `ids` in one round trip. Same result as one `FetchCacheData`
  per id; it exists because the web's merge write must read each existing row, and N bridge round trips
  (saving 50 chats took 51) cost far more than N in-process SQLite queries. Missing ids are omitted, so
  order and length do not match the request (the caller re-indexes by id, so padded or `null` slots would only
  add payload). A shell that does not know the message answers `NOT_FOUND` and the web falls back to per-id
  fetches; since the web ships ahead of the app, that fallback is required, not optional.
- **`FetchAllCacheData`** — paged or multiple rows; `query` (plus paging meta) is part of the cache key, and
  the reply echoes it. For chat, `cursorNo` reads below that message number; `includeUnsent` (default `false`)
  adds unsent rows (`chatNo: 0`, sending or failed) to the latest page. It is opt-in because `apps/web` on the
  phone goes through the same executor, so only a caller that turns it on sees a change.
- **`SaveCacheData`** / **`SaveAllCacheData`** — upsert one row or many (the latter with the paging index
  for `query`). Replies carry `success`, with the saved id(s).
- **`DeleteCacheData`** / **`DeleteAllCacheData`** — delete one row by id, or many by `ids`.
- **`ClearCacheData`** — empty a whole domain table for the partition.
- **`ClearCacheDataByChannel`** — delete only one channel's rows. It is a separate message rather than a
  `channelId` field on `ClearCacheData` on purpose: an older app ignores the unknown field and would clear the
  whole table for that scope, whereas an unknown message type cannot fail that way. Every phone shell the web
  still runs in (app 0.30.0 and later) handles it.
- **`SearchGlobalCacheData`** — keyword search across chats, channels and sites; `cid` / `uid` optional.

## Chat previews

- **`FetchLastChatsData`** — one preview row per channel for the whole home list in a single round trip,
  instead of a 30-row window per channel. Chat only. The app's SQL decides eligibility (excludes thread
  replies, reaction events, system rows and failed sends; includes tombstones; prefers the latest unsent), but
  the web stays the final owner of those rules: it re-validates the rows and, when one fails, falls back to a
  windowed query for that channel only. Every phone shell from app 0.30.0 answers it; if a read fails anyway the
  web answers that read per channel (`NativeDBAdapter.loadLastPerChannel` resolves `null`).
    - Per channel: `lastNo` is the highest `chatNo` in that channel's cache whether or not it is previewable (the
      baseline the web's head trigger compares against); `item` is the latest row that passed the preview rules
      (never a thread reply), `null` when none; `activityItem` is the latest row that counts as activity (the same
      rules with thread replies allowed), so it is `item` or newer, `null` if none, and **absent** from an app
      build that predates it, which the web answers with a windowed read for that channel.
    - A channel with no cached rows is `{ lastNo: 0, item: null }`, not `null`. `items: null` is a native error and
      only that read falls back.

## Room media index (since 2.25.0)

The web computes a message's media entries once (`chatMediaEntries` in `@chatic/data`) and carries them on the
chat row, so the stores only store and index them and the shell never needs the rules. A shell that lacks all
three messages is detected from the handshake and never sent them; the web pages through plain chat rows
instead.

- **`FetchChatMediaCacheData`** — one page of a room's index for one `kind` (`image`, `video`, `file`, `audio`,
  `link`). Newest first by `chatNo`, within a message by `idx`. `cursorNo` reads below that message number;
  absent starts at the newest. A page never splits a message: if the `limit`-th entry's message has more entries
  of that kind they are all included, so a page can run a little over `limit` (the cursor is one message number,
  and half a message would lose its tail to the next page). Each item is the entry plus the cached chat row.
  `nextCursorNo` is the page's last message number, `null` when nothing is cached below. `items: null` is a
  native error answered through the plain-row path for that read.
- **`CountChatMediaCacheData`** — entries per kind for a room; a kind with none is `0`; `counts: null` is a
  native error.
- **`SaveChatMediaCacheData`** — first-read fill: write the media entries of messages the room already had
  cached, without rewriting their rows. For each item the store replaces the message's entries only while its
  chat row still exists and the row's `mediaEntriesVersion` (absent = 0) is below the fill's `version`;
  otherwise it skips the item. The row itself is never written, so its cache stamp and the screens reading it
  are untouched, and anything written since the fill read it wins. `success: false` is a native error: the fill
  stops and the room is not marked.

## Row fields that carry rules

- **`CacheChatView.mediaEntries`** — attached by the web on every chat write so the store can rewrite the
  entries in the same transaction as the row. **Absent and empty differ:** absent means the writer predates
  the index (an older web bundle), so the store leaves the message's entries alone; an empty list means the
  message has none (deleted, unsent or text only), so the store removes whatever it had.
- **`mediaEntriesVersion`** — the rules version the entries were decided under; absent reads as 0. A fill writes a
  message's entries only while this is below its own version, so a write that landed after the fill read the
  row, a delete mark included, is never undone by it.
- **`ChatMediaKind`** is stored as text in the shell's `chat_media` table and in IndexedDB rows, so the set is
  part of both schemas: adding a kind is a schema decision, and renaming one strands every stored row.
  `ChatMediaEntry.idx` orders entries within a message: an attachment is its `upload$$` position (0..n-1), a
  link is n plus its order in the text, so attachments come first and the order survives a re-index. `ref` is an
  attachment's server upload id or a link's URL. `CHAT_MEDIA_KINDS` lists the kinds in the order a count shows.
- **`CacheChatView.upload$$`** holds the server's `UploadView` once a message is sent, and a `PendingUploadSlot`
  while it is on its way. A pending slot uses only local names (`localStatus`, `localThumbUrl`, and for a video
  or document `localName` / `localContentType` / `localSize`), never the server's `status`, `error`, `url` or
  `thumbnail`, because the server's `failed` is terminal while a local `failed` can be retried and a reader that
  met one name would mistake one for the other. `localThumbUrl` is an object URL for this page only; it dies
  with the page and is never sent anywhere. The shell stores the row as is.
- **`CacheChatView.hiddenByFeed`** — local only: this device hid the row because a feed page answering for its
  number left it out, not because the server announced a delete. The next server copy of the row that does not
  say it is hidden undoes the mark; a server delete is not undone.
- **`CacheCloudView.acceptedBy`** — device user ids that accepted an invite into the cloud (the `delegatorId`
  each acceptance was bound to). The cache is one partition per device, not per user, and `apps/web` reads this
  to keep one device user's invited cloud out of another's list; desktop-web and the runtime's push recovery
  neither write nor read it. Absent on older rows, which therefore cannot be attributed.
- **`CacheChannelView.lastActivityAt`** — optional and currently populated by nothing. The chat cache owns "when
  a channel last moved", so `toDomainChannel` deliberately does not fold in a server summary: that would give one
  channel two answers.
- **`CacheJoinView.metaNo`** — snapshot of `channel.metaNo` at the read cursor (`chatNo`). The server sends it in
  the join payload but the published `JoinView` does not declare it yet, so it is widened here. Unread counts
  use `(channel.chatNo - channel.metaNo) - (join.chatNo - join.metaNo)`. Absent on rows written before the server
  sent it.
- **`CacheMetaView.routing`** — the cache routing fingerprint at the time the cursor was saved. A cursor points
  at a sync position in another domain, so if that domain moves to a different store a leftover cursor would say
  "already synced" while the new store is empty. If the fingerprint differs the cursor is invalid and a full
  resync (`since=0`) is forced.
- **`CacheInviteView`** deliberately omits `code` and `deeplink`: the code is a credential and the deeplink
  embeds it whole as `?code=<code>`. The type is only a compile-time contract; the real enforcement is the
  allowlist mapper (`toCacheInviteView`) right before saving. `dismissedAt` is epoch ms when this device hid the
  card: a display decision on this device, not server state.
