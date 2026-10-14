# search — one screen over the local cache

`apps/web/src/app/features/search` is a single page at `/search`: a keyword box, recent keywords,
and four sections of results — clouds, places, channels and messages. Tapping a result takes you
there, switching cloud and place on the way when it belongs to somewhere you are not.

**It searches the cache, never the server.** There is no search API; what is searchable is what this
device has already cached, and every rule below follows from that.

## Responsibilities

This feature decides **what a match means and where it leads**. It decides nothing about how rows
are stored or scanned — the global cache search source is
[`@chatic/data`](../../../../../libs/data/README.md)'s — and nothing about the room a message result
opens into, which is [channels](../channels/README.md).

It also refuses to pull. A result row is a plain model and calls nothing: no observer, no sync
registration, no fetch. That is the constraint the whole design is arranged around, because a list
that re-registers per row would re-register on every keystroke.

## The shared contract

### One cloud at a time, except for cloud names

The cache search source can scan every partition, and this screen asks for one. Cache rows are
partitioned by `(cid, uid)`, and `uid` comes from the **active** session token — so a cloud's rows
are written under that cloud's uid and are filtered out when read from any other session. Searching
"everywhere" therefore returned a set that was partial in a way no user could predict. One cloud at
a time is honest about what is searchable (ADR-0033).

Cloud **names** are the exception, and they are matched across every known cloud: they come from the
catalog, the invited list and the cached-name map rather than from a cache scan, so the partitioning
does not touch them — and matching them is what lets someone jump to another cloud from here.

Three name sources are merged, cached name last so it wins, mirroring how home resolves a cloud
name. The cached one is load-bearing on its own: the relay catalog is a REST read gated on
`isAuthenticated`, so logging out of a cloud session empties it, and without the cache the cloud
section and every row's cloud label went blank while the names sat in local storage.

### The join window applies here too

The cache keeps a channel's messages after I leave it — the chat sync plan has no `onRemove` — and
the global scan reads the chat table whole. Without a filter, messages from rooms I am no longer in
surface as results, historically with no channel name attached (ADR-0067).

So `isInJoinWindow` is applied three times, against the same `joinedNo`: to drop message rows, to
drop a channel row's stale preview, and to skip the sender-profile read for a message that is about
to be dropped. A message from before my current membership is not a result, and must not cost a
round trip either.

### Context is one batch read, arriving after the matches

A matched row cannot name its own surroundings: a chat row has no `sid`, and a channel row does not
carry its place's name, my unread count or the newest message. One `resolveContext` batch fills all
of that in, keyed by the cids and channel refs the matches mention.

**Rows render before it lands.** The match's own fields (name, thumbnail, member count) draw
immediately and the context-dependent fields fill a beat later. A failed resolve leaves those fields
blank rather than discarding results the reader is already looking at — losing a place name is a
smaller failure than losing the results.

Both this effect and the sender-profile one key off a **serialized** request key rather than the
arrays themselves. The search hook rebuilds its arrays on every render, so depending on identity
re-ran the effect, which set state, which re-rendered: results flickered and re-searched in a loop.
For the same reason cloud-name matching runs during render instead of inside the search effect.

### A message's author is addressed by place, not by account

`senderName` and `senderThumbnail` are the author's **place profile** — the identity that place
actually shows for that person. There is no fallback to the account name: that is a different,
private label, and an unresolved author simply reads as unnamed.

A profile sync is registered per member only while a room is open, so a result from a room the user
has never opened has nothing cached. `useSenderProfiles` therefore goes through `ProfileRepository`
— observing the cache for what is there and fetching the rest — with **one subscription per place**
rather than per row, and it registers **no sync target**: search shows a snapshot, and a poll per
author would keep running for people whose rooms are not even open.

### Navigation switches first and reports failure

A result in another cloud needs a session switch before the route means anything. `useSearchNavigate`
awaits the socket handshake, switches cloud, awaits the handshake **again** — `switchSite` is a
socket call on the freshly bound connection — then switches place, then navigates.

The place switch is not optional. A place result lands on home, and home renders the session's
`selectedSiteId` rather than anything in the URL; a channel result switches too, so backing out of
the room lands on the home of the place that room belongs to. After a cloud switch the place switch
is unconditional, because `selectedSiteId` no longer describes the new session.

Two rules on failure: it **toasts rather than navigating anyway** — the user clicked a result and is
waiting, so a silent wrong destination is worse than being told it did not work — and a cloud switch
that succeeded is **not rolled back** when the place switch fails. Rolling back is another
failure-prone round trip, and it would leave the session in a less certain state than stopping.

A ref guards against a second result being tapped mid-switch.

### The keyword lives in the URL, the recents in config

`/search?q=` carries the keyword so coming back from a result restores the search that led there;
page-local state alone was lost on unmount and dropped the user onto an empty box. Keystrokes mirror
with `replace`, so typing does not fill the history stack.

Recent keywords are the `ui.recentSearches` config row on the local lane, deduped
case-insensitively, newest first, capped. They are per device, like every other local-lane row.

### What a row shows

Rows are stamped with **date over time**, not the home list's clock alone: search reaches back
through history, and `14:32` cannot tell this year's message from last year's.

Location crumbs are joined with `›` and an unresolved crumb is simply dropped — **never replaced by
a raw id**. A row prints text and cannot draw markup, so a message body arrives flattened the way
the home list flattens it: a Block Kit payload as its text, the markup the reader understands
dropped (backticks and fences, and whatever else
[Message text](../channels/chat-room.md#message-text-is-not-markdown) lists) and a labelled link
read as its words. The two kinds of row flatten differently, on purpose:

- **A room row's preview** is `lastChatPreview` — the home list's own line for that room: a deleted
  last message as `chat.room.deletedMessage`, text with a fenced block cut to its first line, and an
  attachment-only message as what it carries ("Photo", "3 videos").
- **A message row** is `messageSearchText`, which keeps every line of a fenced block, because the
  row highlights the query inside it. A match on a code block's third line has to survive the
  flattening to be highlighted; the row is one line and truncates either way, and `HighlightText`
  trims the lead so the match stays in view.

**A deleted message is not a result.** The server's delete is soft — it sets `hidden` and keeps the
body — and the cache writes the row back the same way, so a deleted row still holds its words and both
cache scans (IndexedDB and the native SQLite `LIKE`) match on them. `useGlobalSearch` drops `hidden`
rows before the 30-message cap, so a deleted row never takes a live result's place. Printing them as
"Deleted message" instead was rejected: the row would tell the reader that a message they can no
longer read contained what they typed. The flag is read for truthiness, since the server sends it as
0/1. A message deleted while this device was offline is the one gap: `chat.sync` does not replay the
delete and `chat.feed` merely omits the row, so the cached copy can stay unflagged — and searchable.
That is the sync layer's gap, and closing it belongs there, not in this filter.

The scan itself matches the raw stored body, not the flattened one. A query that only hits markup —
the address behind a labelled link, a backtick — still finds the message, and its row then shows the
body without a highlight rather than printing the markup back. Words split by a marker
(`` `yarn` deploy `` for `yarn deploy`) do not match; matching against the flattened body would be a
change to the cache scan, not to this screen. Desktop search differs here: it matches a labelled link by
its words, so a query on the address alone finds the message on web and not on desktop.

A message result opens the room with `?chatNo=`, which the room converts into a jump request and
then strips from the URL so a reload does not re-jump. The scroll, the highlight and the older-page
load belong to [channels](../channels/README.md).

## What not to do

- **Do not let a result row fetch, observe or register anything.** Hand it a model. The batch reads
  above exist so it does not have to.
- **Do not put a cloud source into the search effect's dependencies.** Both cloud lists are new
  arrays on every render; that is the render loop.
- **Do not drop the join window from any of its three places.** A message I can no longer read is
  not a result.
- **Do not name a message's author from the account cache.** Place profile or nothing.
- **Do not navigate when a switch failed.** Toast, and stay.
- **Do not show a raw id as a location crumb.**
- **Do not widen the scan back to every cloud** without solving the `uid` partitioning first; the
  result set would be silently partial again.

## Notes for implementers and tests

Four hooks carry specs — the search itself, the context resolution, the navigation switch order and
the sender profiles. The page has one too.

```bash
npx jest --config apps/web/jest.config.js features/search
```

- **`useDebounce` is inlined here rather than imported from `@chatic/shared`.** That package's root
  barrel re-exports `ErrorFallback`, which pulls in `@chatic/assets` — a mapping this app's jest
  config does not have, so any suite importing the hook failed to resolve.
- **The debounce, minimum query length and section caps match desktop-web's own search.** They are
  constants at the top of `useGlobalSearch`; keep the two in step when changing one.
- **A failed cache search still shows cloud-name matches.** Those are derived during render and are
  unaffected by the bridge call, so the screen degrades rather than going blank. The failure is
  logged under `SEARCH`.

## Further reading

- [channels](../channels/README.md) — the room a result opens, and the message jump.
- [home](../home/README.md) — the header button that leads here, and the cloud-name resolution this
  screen mirrors.
- [`@chatic/data`](../../../../../libs/data/README.md) — the global cache search source, the
  partitioning, and the join window.
- [`@chatic/config`](../../../../../libs/config/README.md) — the lane the recent keywords are
  stored on.
