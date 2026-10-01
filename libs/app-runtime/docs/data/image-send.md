# image send — `useSendImages`

> Canonical code: [`hooks/useSendImages.ts`](../../src/data/hooks/useSendImages.ts). The sequence it
> runs is `@chatic/data`'s, documented in
> [libs/data docs/uploads](../../../data/docs/uploads/README.md). Consumers: `apps/desktop-web`'s room and
> thread composers (`useComposerSend`, which binds `xhrPut`), and `apps/web`'s shell binding
> ([image-send.md](../../../../apps/web/docs/feature/channels/image-send.md)).

`data.useSendImages({ cid, channelId, parentId?, put, putShellFile?, prepareVideo?, onVideoRefused?, beforeSweep? })`
sends picked attachments — page files, and in the mobile app shell files too — as one
message and returns `{ sendImages, retry, canRetry, discard }`. It holds no rules about uploads
itself. It binds the data layer's `sendImageMessage` to the room's cloud and to the PUT the shell
passes in, and it keeps the picked files for as long as a retry could still need them.

What differs between shells enters as two ports, so every shell runs the same orchestration:

| Port           | Browser and desktop          | Mobile app (`apps/web` inside the native shell)                     |
| -------------- | ---------------------------- | ------------------------------------------------------------------- |
| `put`          | `xhrPut` from `@chatic/data` | the native transfer module, falling back to `xhrPut` in old builds  |
| `beforeSweep`  | none                         | catch up with transfers the app finished while the page was away    |
| `putShellFile` | none                         | the transfer module, sending a file the shell keeps from its folder |
| `prepareVideo` | none                         | `PrepareVideo`: the shell converts a video and makes its poster     |

`sendImages` resolves once the send has settled, sent or failed — a caller that has to follow the
message with another one awaits it. Desktop sends the composer's text first, at the press, and the
pictures after it, so it awaits nothing.

**Everything is addressed to `cid`, the room's own cloud** — the channel row's `cid`, never the
selection. Each pending entry remembers it, every repository call goes through
`getCloudRepositories(cid)`, and the upload and the send run inside
`runInCloud(cid, …)`, which holds that cloud's socket until the send settles. An upload
takes seconds, and a cloud switch in that time used to put the finished message on the next cloud's
socket while its row stayed in the first; now the row, the upload and the send stay together
whichever cloud is on screen by the time it ends.

## What happens on send

1. **A pending row goes into the cache first** (`chat.createPendingImageChat`), with an object-URL
   preview per file, so the message is on screen before anything is prepared or uploaded. The list
   is cut to ten first, so the row never shows a slot that will not be sent. A video or document
   also passes its name, type and size (`localFiles`), which its slot keeps for the card drawn in
   place of a preview. A send of images only passes none and writes the row it always has.
2. **The sequence runs** on ports the hook binds: `prepare` is `prepareChatAttachment(file)` for an
   image. A video or document (`chatAttachmentFormat` in `@chatic/data`) is not redrawn: it goes up
   as its original with no dimensions and no thumbnail, under the server's content type and a name
   that ends in its format's extension. The other ports:
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

## Shell files and video conversion

A shell file (`ShellFileRef`, see [the uploads doc](../../../data/docs/uploads/README.md)) is sent from
the shell's own folder through `putShellFile`. A shell file that reaches a shell with no
`putShellFile` fails its slot; it is never handed to `put`, which could not read it. A shell document
is sent under the name and type `chatAttachmentFormat` gives it, so an HWP the OS typed
`application/octet-stream` goes up as `application/x-hwp`.

**A shell video is converted before the sequence starts, not inside its `prepare` port.** After the
pending row is written, the hook calls `prepareVideo` for each shell video, one at a time in pick
order, outside the cloud's socket hold (a conversion can take minutes and needs no socket). The
sequence fails the whole message when its `prepare` throws, and a refused video must fail alone, so:

- **A refusal fails only that video.** `TOO_LARGE`, `UNSUPPORTED`, `SOURCE`, `SYSTEM` or a timeout
  leaves the video out of the list the sequence runs on, and it is reported the way a slot whose upload
  failed is: written as a failed message of its own, with the usual retry. `onVideoRefused` is told
  `too-large` or `unsupported`, so the screen can say why.
- **The result is judged again** with `judgeChatAttachments`, since the shell only estimated its size
  before converting. A result over the limit is refused like a `TOO_LARGE`.
- **Inside the sequence, `prepare` passes the converted file and its poster through** as the slot's
  original and thumbnail, both shell files.
- **The poster becomes the row's preview.** The shell hands a base64 copy of it, which `prepareVideo`
  returns as a `Blob`; the one preview rewrite (below) points the video's slot at it. Until then a shell
  file's slot has no preview, and neither does a page video: an object URL of an `mp4` drawn as an
  image only breaks.

**A shell file the shell has lost cannot be retried.** When `prepareVideo` or the shell's PUT answers
`SOURCE`, the file is marked gone for the page. Left out of a sent message, gone files are written as a
failed row of their own with no files in memory, so delete is all it offers; a failed message whose
every file is gone lets its files go the same way.

## Memory, and what it cannot hold

The picked files live in a map keyed by pending row id, **one per page**, not per screen. A room
and its thread can be open at once, and each drops only its own entries.

| When                                       | The entry                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the message is sent                        | dropped, previews revoked                                                                                                                                         |
| `discard(pendingId)`                       | dropped, previews revoked. The row itself goes through each app's failed-message delete (web `useChatMutations.deleteMessage`, desktop `useComposerSend.discard`) |
| the screen leaves the channel, or unmounts | dropped. A send still running keeps its files until it settles, then drops them — unless the screen came back meanwhile                                           |

A `File` cannot be stored, so a reload loses the map. The pending row does not go with it: the web
cache never evicts unsent rows, and the native cache keeps whole rows. Left alone, such a row would
show "sending" forever, because nothing is left that could finish it.

**So attaching to a channel sweeps.** Once per attach, the hook reads the channel's pending image
rows (`chat.listPendingImageChats`) and marks failed every one that is still sending, older than
this screen, and has no entry in the map. `canRetry` is false for those, so delete is the only way
out. A row written after the screen attached is skipped, because it may simply not have reached the
map yet. Text optimistic rows are not touched. They have the same fate after a reload, but that
predates this hook.

A screen with no room yet (an empty `cid` or `channelId`) still lets the shell catch up, and then
does not sweep.

The sweep waits for `beforeSweep` first: a shell that finishes transfers while the page is away
catches up there, so a row it finished is settled rather than failed as a leftover.

## Not done here

- **Rendering.** The pending slots are `{ localStatus, localThumbUrl }`, plus `localName`,
  `localContentType` and `localSize` for a video or document. The tile that draws them,
  the retry and delete buttons and the picker belong to each app's composer.
- **Progress, cancel, a hash.** None are shown or sent.
- **Surviving a reload.** An image message is sent from memory only. A reload or an OS kill mid-send
  loses it, and the row becomes a failed, delete-only leftover.

## How to verify

```bash
npx jest --config libs/app-runtime/jest.config.js libs/app-runtime/src/data/hooks/useSendImages
```
