# image send — `useSendImages`

> Canonical code: [`hooks/useSendImages.ts`](../../src/data/hooks/useSendImages.ts). The sequence it
> runs is `@chatic/data`'s, documented in
> [libs/data docs/uploads](../../../data/docs/uploads/README.md). Consumer: `apps/web`'s shell binding
> ([image-send.md](../../../../apps/web/docs/feature/channels/image-send.md)).

`data.useSendImages({ cid, channelId, parentId?, put, beforeSweep? })` sends picked images as one
message and returns `{ sendImages, retry, canRetry, discard }`. It holds no rules about uploads
itself. It binds the data layer's `sendImageMessage` to the room's cloud and to the PUT the shell
passes in, and it keeps the picked files for as long as a retry could still need them.

What differs between shells enters as two ports, so every shell runs the same orchestration:

| Port          | Browser and desktop          | Mobile app (`apps/web` inside the native shell)                    |
| ------------- | ---------------------------- | ------------------------------------------------------------------ |
| `put`         | `xhrPut` from `@chatic/data` | the native transfer module, falling back to `xhrPut` in old builds |
| `beforeSweep` | none                         | catch up with transfers the app finished while the page was away   |

`sendImages` resolves once the send has settled, sent or failed — a caller that has to follow the
message with another one awaits it.

**Everything is addressed to `cid`, the room's own cloud** — the channel row's `cid`, never the
selection. Each pending entry remembers it, every repository call goes through
`getCloudRepositories(cid)`, and the upload and the send run inside
`runInCloud(cid, …)`, which holds that cloud's socket until the send settles. An upload
takes seconds, and a cloud switch in that time used to put the finished message on the next cloud's
socket while its row stayed in the first; now the row, the upload and the send stay together
whichever cloud is on screen by the time it ends.

## What happens on send

1. **A pending row goes into the cache first** (`chat.createPendingImageChat`), with an object-URL
   preview per image, so the message is on screen before anything is prepared or uploaded. The list
   is cut to ten first, so the row never shows a slot that will not be sent.
2. **The sequence runs** on ports the hook binds: `prepare` is `prepareImage(file, CHAT_ATTACHMENT)`,
   `start` / `complete` / `send` are the chat repository's `startUploads` / `completeUploads` /
   `sendPendingImageChat(pendingId, …)`, and `put` is the sender the shell passed in.
3. **Sent** — the repository has already swapped in the server's row and read it back once for the
   image addresses, which the send's own answer does not carry. The hook lets the files go and
   revokes the previews.
4. **Failed** — the row is marked failed (`chat.failPendingImageChat`), and the files stay in memory
   so `retry(pendingId)` can send the same pictures again on the same row. `canRetry` turns true only
   once the failure is written, and a retry claims the row before its first await, so a double tap
   runs once. The map lives outside React, so every change to it bumps a version the hook subscribes
   to (`useSyncExternalStore`) and `canRetry` comes back as a new function: a memoised row that takes
   it re-renders when its Retry becomes available, even though the failure write re-rendered it a
   moment earlier. A retry of a row deleted meanwhile answers `false` and lets the files go.

The row starts from the original files' object URLs: the thumbnails do not exist yet when it is
written, and holding the row back until they do would break "the pick is the send". Once every image
is prepared — before the upload starts — the row is rewritten **once**, with a thumbnail preview for
each image that has one (a GIF keeps its original). One cache write per message, not per image, and
the feed stops decoding full-size photos for small tiles. A retry keeps the thumbnails it already has.

## Memory, and what it cannot hold

The picked files live in a map keyed by pending row id, **one per page**, not per screen. A room
and its thread can be open at once, and each drops only its own entries.

| When                                       | The entry                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| the message is sent                        | dropped, previews revoked                                                                                                    |
| `discard(pendingId)`                       | dropped, previews revoked. The row itself goes through the existing failed-message delete (`useChatMutations.deleteMessage`) |
| the screen leaves the channel, or unmounts | dropped. A send still running keeps its files until it settles, then drops them — unless the screen came back meanwhile      |

A `File` cannot be stored, so a reload loses the map. The pending row does not go with it: the web
cache never evicts unsent rows, and the native cache keeps whole rows. Left alone, such a row would
show "sending" forever, because nothing is left that could finish it.

**So attaching to a channel sweeps.** Once per attach, the hook reads the channel's pending image
rows (`chat.listPendingImageChats`) and marks failed every one that is still sending, older than
this screen, and has no entry in the map. `canRetry` is false for those, so delete is the only way
out. A row written after the screen attached is skipped, because it may simply not have reached the
map yet. Text optimistic rows are not touched. They have the same fate after a reload, but that
predates this hook.

The sweep waits for `beforeSweep` first: a shell that finishes transfers while the page is away
catches up there, so a row it finished is settled rather than failed as a leftover.

## Not done here

- **Rendering.** The pending slots are `{ localStatus, localThumbUrl }`. The tile that draws them,
  the retry and delete buttons and the picker belong to each app's composer.
- **Progress, cancel, a hash.** None are shown or sent.
- **Surviving a reload.** An image message is sent from memory only. A reload or an OS kill mid-send
  loses it, and the row becomes a failed, delete-only leftover.

## How to verify

```bash
npx jest --config libs/app-runtime/jest.config.js libs/app-runtime/src/data/hooks/useSendImages
```
