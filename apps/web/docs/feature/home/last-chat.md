# last-chat — the message preview under every channel row

The home channel list prints the last message of each room under its name, and orders the list by
the time that message was sent. Both come from **one list-level observation of the chat cache**, so
the text a row shows and the position it holds can never tell two different stories.

This document owns where that value comes from. What the row looks like is in
[README](./README.md); the caches themselves belong to [`@chatic/data`](../../../../../libs/data/README.md).

## The server's `lastChat$` is not the source

`ChannelView` carries a `lastChat$` summary and the client deliberately drops it.
`toDomainChannel` in `libs/data/src/domain/mappers.ts` maps a channel without ever reading that
field, so `DomainChannel` has no server-side notion of a last message. Folding one in would give a
single channel two disagreeing answers to "when did this last move" — the summary's, and the chat
cache's.

The rule lives in the mapper, so it holds for every consumer of a channel, not just home:

```bash
grep -rn "lastChat\$" --include='*.ts' libs/data/src
```

## The read — `useLastChats`

`apps/web/src/app/hooks/useLastChats.ts` takes the rendered channels and returns a
`Map<channelId, DomainChat>`.

1. It builds a **sorted, comma-joined key** of the channel ids. Re-ordering the list (a pin, a sort
   change) produces the same key, so the subscription is not torn down when only the order moved.
2. It subscribes once with `chat.observeLastList(channelIds, …)`. That is one repository call for
   the whole list, not one per row.
3. It filters each row against my join window (`isInJoinWindow` against `join.joinedNo`). Leaving a
   channel does not clear its chat cache, so a channel I re-joined would otherwise preview a
   message from before I left — one the server no longer serves.

The filter is applied in a `useMemo` **outside** the subscription effect. `joinByChannel` is a fresh
Map on most renders, and depending on it inside the effect would re-open the whole list's
subscription every time a read cursor moved.

`useLastChats` is a pure cache read. It issues no request; a channel whose cache is empty simply has
no preview.

## The write — `useChatSyncRegistration`

Because the list only reads, something else has to put newer messages into the cache, or the
previews sit still until the room is opened. `apps/web/src/app/hooks/useChatSyncRegistration.ts`
is that writer, and it is mounted by the surface rather than by a row. It has two mechanisms,
because `ChatSyncPlan.run` is a no-op and registering alone loads nothing:

- **Target registration** — `sync.registerChat(channelId, undefined, { cid })` per channel, under the
  cloud whose rows the list shows, so a `chat.sync` frame
  arriving for any of the site's channels is appended live. Registration is ref-counted by key, so
  an open room's own registration for the same channel dedups into this one.
- **Head-triggered catch-up** — a channel whose polled head (`channel.chatNo`) has run ahead of
  what the chat cache holds gets one page of `CATCH_UP_LIMIT` (30) pulled. This is the convergence
  guarantee: it does not care whether a push was delivered, missed or scoped away, and it fires only
  for channels that actually moved.

The catch-up lives in the registration hook and not in the list component on purpose — rendering a
row must never be the thing that makes a network call.

The targets are the selected cloud's, registered with `{ cid }` and gated on that cloud's own slot.
The plan baseline (`updateLocalSnapshot`) is sent to the cloud the observation was **made** in,
carried with the reading: the observation and the effect that pushes it are separate renders, and a
switch between them would otherwise hand one cloud's `lastNo` to the next cloud's plan.

Both hooks derive their key the same way, from the same sorted channel ids, so the two
`observeLastList` calls resolve to one shared observation rather than two.

## Ordering — the same value the row prints

`apps/web/src/app/utils/sortChannels.ts` takes the map as `lastChatByChannel` and orders by each
chat's `createdAtMs ?? createdAt`, descending. An optimistic row carries `createdAt = now`, so
sending a message floats its channel before the server answers. The `unread` sort method and the
pinned set are applied as stable passes on top of that order, so a pin always wins. Two rules follow
from the activity time itself:

- **A channel with no cached message falls back to `channel.updatedAt`.** It has no activity time of
  its own, and that includes a channel just re-joined whose old rows the join-window filter removed.
- **My `join.updatedAt` is never used for ordering.** It also moves when I merely _read_ a room, so
  it is not "when the room last moved". `joinByChannel` stays for the nickname and mute readouts.

## What the row prints

`ChannelList` turns the last chat into one line, in this order: a deleted message prints
`chat.room.deletedMessage`; a message with text prints the text (code markup flattened), whatever it
has attached; and a message with attachments and no text prints what it carries.

That last case reads `chatAttachmentSummary` from `libs/data` — the kind and number of the chat's
attachments, taken from each slot of `upload$$` (or from `uploadIds` on a row that has no `upload$$`):

| Kind                              | One                                   | Several                                        |
| --------------------------------- | ------------------------------------- | ---------------------------------------------- |
| `image`                           | `chat.attach.preview` — `사진`        | `chat.attach.previewCount` — `사진 3장`        |
| `video`                           | `chat.attach.previewVideo` — `동영상` | `chat.attach.previewVideoCount` — `동영상 2개` |
| `file`                            | `chat.attach.previewFile` — `파일`    | `chat.attach.previewFileCount` — `파일 3개`    |
| `mixed` (several kinds, or audio) | —                                     | `chat.attach.previewMixedCount` — `첨부 3개`   |

- **A sent upload says its kind in `stereo`; a slot still being sent, by the content type it kept**
  (`uploadSlotKind` in `libs/data`). A slot with no type, an upload with no `stereo`, and a row with bare
  `uploadIds` count as images — every attachment was one until the server took videos and documents.
  Reading them any other way would flash "1 attachment" under a photo that is on its way.
- **Audio has no noun of its own**, so even a single audio file prints the `mixed` count form.
- **The nouns are the push's nouns.** The mobile push for the same message says
  `사진 3장을 보냈습니다` / `Sent 3 photos` (`apps/mobile/docs/push/README.md`, "Chat message body"),
  and the server picks that push's key by the same kind rule, so the row and the push name the same thing.
  Changing a noun or counter here means changing the push copy with it.
- `apps/desktop-web` previews its rows with the same `chatAttachmentSummary`, so the two lists agree.

### A room's draft

A room whose composer holds a draft (ADR-0183,
[chat-room.md](../channels/chat-room.md#the-composers-draft)) prints the draft instead of the last
chat, behind a pencil glyph (`IconEdit`, named `channelList.draft` for screen readers) through the kit's
`ListRow.subtitleIcon`. No colour of its own: the row keeps red for the unread badge. The typed text prints on one line, code markup flattened as above; with no
text but a waiting file, the file's name, or `chat.attach.previewFileCount` for several. A blank draft
prints nothing of its own. Only the room's own draft counts — a thread's stays with the thread. The
time and the unread badge still come from the last chat, and so does the order. The row subscribes to
`useComposerDraftStore`, so it changes as the draft does. `blurLastMessage` blurs the draft's text and
leaves the pencil readable.

## Unread is a separate calculation

Changing the preview source changed nothing about unread. `useChannelUnreads` works from the
channel's own `channel.chatNo` and the embedded `$join` cursor, and depends on neither the chat
registration nor this observation. See [unread-dot](./unread-dot.md).

## Where it is consumed

Home's `ChannelList` prints the preview and takes the order from it; place channel management reads
the same map at page level; and search deliberately reads it without registering a row-level sync —
`useSearchContext` says why.

## Notes for implementers and tests

- Do not reintroduce a per-row hook. A row-level `useLastChat` costs one subscription per visible
  channel and reopens them all on any re-order. `apps/desktop-web` still has one; it is a separate
  app with a separate list and is not a precedent for this one.
- A preview that will not update is almost always a missing write, not a missing read — check that
  the surface mounts `useChatSyncRegistration`, not that the observation fired.
- An empty preview on a re-joined channel is correct behaviour, not a bug.

## Further reading

- [README](./README.md) — the home screen the list belongs to
- [unread-dot](./unread-dot.md) — the unread formula and its surfaces
- [`libs/data`](../../../../../libs/data/README.md) — the chat cache, `observeLastList` and the
  channel mapper
- [`libs/app-runtime`](../../../../../libs/app-runtime/README.md) — `SyncManager`, `registerChat`
  and `ChatSyncPlan`
