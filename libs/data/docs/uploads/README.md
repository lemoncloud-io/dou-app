# uploads — sending images as one chat message

> Status: Live (both apps send through `useSendImages` in `@chatic/app-runtime`) · Last updated: 2026-10-08 · Overview in the [lib README](../../README.md) · Canonical code: [uploads/](../../src/uploads/) · The socket half in [remote/socket.md](../remote/socket.md#upload)

`sendImageMessage` turns picked images into one chat message. It knows the order of the socket
operations, what to retry, and what a failure means. It does **not** know how bytes reach storage
(that is a port the shell fills in) or how the pending row is stored (that is `ChatRepository`).

## The sequence

```text
0. pending row      caller: ChatRepository.createPendingImageChat → pendingId   (before any byte moves)
1. prepare          port prepare(file), one file at a time        → { original, thumbnail | null }
2. start            upload.start({ list })                        one ticket per slot, same order
3. PUT              port put(target, file, label), ≤ 3 at once    per slot: original, then thumbnail
4. complete         upload.complete({ list: [{ id, failure? }] }) failed slots included
5. send             port send({ uploadIds })                      only if ≥ 1 slot is stored
```

The sequence never sees the message's text. A caption rides on the pending row and goes out with
the send (§ Pending image rows), so the `send` port carries the upload ids alone.

- **The pending row comes first.** The optimistic message has to be on screen while the photos are
  prepared and uploaded, which takes seconds. `sendChat` makes its optimistic row at request time,
  which is too late for this, so image messages have their own pending-row operations (below).
- **One file at a time in step 1.** On the native shell a decode holds the whole source in WebView
  memory. Once a slot's PUTs are done its prepared bytes are let go.
- **The declared type and size are the prepared file's own.** They are what gets signed, and a
  preparer that re-encodes (a HEIC source into a JPEG, say) changes both. Today's chat policy sends
  the original untouched, so for now they are the picked file's.
- **No thumbnail, no thumbnail field.** The server then stores the original alone.
- **Picking order, not finishing order.** `uploadIds` follow the input, whatever order the PUTs end in.
- **At most ten attachments.** Anything past the tenth is left out. The screen is meant to stop the user
  earlier. This sequence does not re-validate format or size: the server rejects a bad slot at
  `start`, and that slot fails like any other.
- **No hash, no progress, no cancel.** The hash is optional and the server verifies what it stores.
  The screen shows no progress. Nothing here cancels.

## What counts as failure

| PUT result                | Meaning                        | Next                                                              |
| ------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| answered 2xx or **412**   | stored                         | 412 is "already there": a retry whose first answer was lost       |
| answered 403              | the signature probably expired | re-issue **that slot only**, once: `start({ list: [{ id, … }] })` |
| any other answer          | failed                         | reported to `complete` as `{ source: 'storage', code, status }`   |
| no answer: network        | transient                      | same ticket again after 1s, then 3s. A third failure fails it     |
| no answer: source, system | failed                         | not retried: nothing changes by trying again                      |

- **A slot failing is not the message failing.** Whatever reached `stored` is sent, and the server
  marks the other slots itself. The message fails only when nothing is stored. A sent result names
  the slots it left out (`failedIndexes`, by position in the pick), so the caller can keep those
  files: `useSendImages` writes them as a failed message of their own, with the usual retry.
- **A thumbnail never fails its slot.** If the thumbnail PUT fails, the slot still counts as done and
  the server keeps the original without a preview.
- **A socket operation failing is the message failing.** That covers `start`, `complete`, `send`, and
  an answer the guard rejects. A retry starts over from step 1. Uploads the failed attempt had
  already stored are abandoned, and the server clears them within a day. That waste is accepted
  rather than tracking upload ids across attempts.
- **A failed re-issue fails only its slot.** The other slots still hold valid tickets.

Retry and re-issue live here and nowhere else. A PUT port reports what happened and never decides,
so the web sender, the native sender and the old-app fallback cannot come to different conclusions.

## Page files and shell files

A pick is made of two kinds of source (`ChatAttachmentSource`):

- **A page file** — a browser `File`, from the page's own input or built from bytes the shell handed
  over (a photo is always one, since the page prepares photos itself).
- **A shell file** (`ShellFileRef`) — a video or document the mobile app picked and copied into its
  own folder. The page holds its `uri`, `name`, `type`, `size` and `kind`, never its bytes: a 300MB
  video does not fit through the bridge, which carries bytes as base64 in a single message.
  `isShellFileRef` tells the two apart. A poster the shell made for a video is a shell file too, with
  the video's `kind`. `needsExport` marks an iOS video the shell has yet to write as an H.264 `mp4`;
  its name, type and size are still the source's.

The sequence does not look inside either. `SendImagePorts<S>` and `PreparedImageMirror<S>` are
generic over the source type, `File` by default, so the browser, desktop and testbed shells that only
ever send page files type their ports as before. A caller that also sends shell files widens `S` to
`ChatAttachmentSource`, and its `put` then takes both: a shell file's original and poster reach it as
shell files, and only the native transfer can send them (`ShellFilePutPort`). The guard that fails a
shell file which reaches a page PUT lives in `useSendImages`, not in `xhrPut`.

**A page file that is a video or document goes up by the page's own PUT, even inside the app.** The
native sender would first copy it to the shell as base64 in one bridge message, and a WebView does not
survive that for a 300MB file. Hand `xhrPut` the picked `File` as it is: a picked file is streamed
from disk, while the same bytes copied into a JS `Blob` are held in memory whole.

The judgement before a send is `judgeChatAttachments` (in `domain/chatImages.ts`): the twelve server
formats, each kind's own limit, the same item twice (a page file by name, size and time, a shell file
by its address), and the per-message limit, in that order. A `too-large` rejection names the kind,
because the limits differ. A video still to convert is judged as the `mp4` it will be and is not
size-checked by its source: the shell's estimate and the check of its result decide that.

The page's own sender lives here too: `xhrPut` (`uploads/xhrPut.ts`) PUTs from the page with
`XMLHttpRequest`, for the browser, the desktop app and the old-app fallback. It sets no progress
listener, because one on `upload` turns every cross-origin PUT into a preflighted one; it skips the
headers the browser owns (`content-length`, `host`); and it bounds the whole PUT at five minutes, or
at the time a 1 Mbps uplink needs for the file when that is longer (about 42 minutes for a 300MB
video). The native sender stays in `apps/web`, since it talks through that shell's bridge.

## The answer guard

The answers are typed by the upload contract in `lemon-model/upload`, which
`@lemoncloud/chatic-socials-api` re-exports (`UploadStartResult`, `UploadTicket`,
`UploadCompleteResult`, `UploadDirectTransfer`, …). They are imported from the SDK, not from
`lemon-model` directly: the SDK is what this repo declares as a dependency, and it is the server's
own statement of the wire shape. The root `resolutions."lemon-model"` pin has to stay at 1.5 or
above. Below that, the SDK's `lemon-model/upload` import does not resolve and every one of those
names silently becomes `any` under `skipLibCheck`.

The types say what the server promises. The socket gateway's `start` / `complete` return whatever
arrived, cast unchecked. So `UploadSocketDataSource` still runs every answer through
`parseUploadStartResult` / `parseUploadCompleteResult`:

- **What it checks.** Each upload's `id` · `status` · `error`, and every field of a transfer:
  `kind` · `method` · `url` · `headers` · `maxBytes`, and `expiresAt` when present. `status` must be
  a contract status, and anything but `failed` must carry an `id`. So must every entry of
  `complete`'s answer.
- **What it keeps.** Only the fields it checked, copied into fresh objects. What the server adds on
  top (the echoed declaration, `stereo`, a stored upload's `url`) is dropped, because nothing here
  reads it. So an upload comes out as `CheckedUpload` (`id` · `status` · `error`), not the full
  `Upload`: the full type would promise a stored upload's `url`, which the guard never keeps.
- **Presigned PUT only.** The contract also has an inline transfer, which is sent through a `send`
  operation. The socket surface has none, so an inline ticket is a broken answer here. The guard's
  result type (`PresignedUploadStartResult`) says so, and the sequence never meets another kind.
- **A mismatch fails the operation.** An answer that breaks the contract rejects the whole `start`
  or `complete`, and the error names the path, never the value.

A PUT sender sees only `UploadPutTarget`, the `url` and `headers` of a transfer, so the shells do
not depend on the rest of the contract.

## Tickets are credentials

A transfer's `url` and `headers` authorise one PUT. They are never logged, persisted or put in an
error message. The guard copies them into a fresh object, the sequence's logs carry slot indexes and
HTTP statuses only, and error logs carry an error's name, not its message. A transport message can
quote the request it failed on.

## Pending image rows

`ChatRepository` owns the row. The sequence only reports its outcome.

| Method                                                                                    | What it does                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPendingImageChat({ channelId, parentId?, localThumbUrls, localFiles?, content? })` | writes the optimistic row, one `{ localStatus: 'sending', localThumbUrl }` slot per file; a video or document's slot also keeps `localName` / `localContentType` / `localSize`. `content` is the message's text, trimmed onto the row (`''` when absent or blank). A rewrite without `localFiles` or `content` keeps what the row holds |
| `createPendingImageChat({ …, pendingId })`                                                | re-arms that same row for a retry: `sending` again, not a second row                                                                                                                                                                                                                                                                    |
| `sendPendingImageChat(pendingId, { uploadIds })`                                          | sends the row's own text with the upload ids, swaps the server's row in the way `sendChat` does, then reads it back once with `chat.get` for the image addresses. Throws if the send fails                                                                                                                                              |
| `failPendingImageChat(pendingId)`                                                         | marks the row and each slot failed. Leaves a deleted row deleted                                                                                                                                                                                                                                                                        |
| `listPendingImageChats(channelId)`                                                        | the channel's unsent rows that hold pending slots                                                                                                                                                                                                                                                                                       |

- **A pending row keeps the scope it was written in.** A send takes long enough for a cloud switch,
  so the repository remembers each row's scope and reads, fails and sends it there. On a graph that
  follows the selection, a send whose selected cloud is no longer the row's throws instead of posting
  the uploads to the wrong cloud. A graph bound to one cloud (the runtime's scoped graph, which the
  apps' image send runs on) sends on that cloud's own socket, so its row and its send always agree.
  A re-arm of a row that was deleted meanwhile throws too, rather than recreating it without a
  channel.
- **A sent message is read back once.** `chat.send`'s answer names the uploads but not where to fetch
  them: its `upload$$` is `{ id, status, stereo }`. The sender gets no broadcast of its own message
  that could fill the addresses in, which was measured on dev. `chat.get` answers `orgUrl` and
  `thumbUrl`, so the confirmed row reads itself back and the images are there when the send resolves.
  A failed read-back leaves the send's answer in place, since the message went out regardless, and
  the images appear the next time the room reads its feed. Note that `chat.get` omits an empty
  `content` instead of answering `''`.
- **The text is the row's.** An image message can carry text too (a caption), sent in the same
  `chat.send` as the upload ids, which is one message with both. `createPendingImageChat` puts it on
  the optimistic row at once, so the pending message shows its text while the files go up, and
  `sendPendingImageChat` sends whatever the row holds rather than a copy the caller passes. A retry
  re-arms the row with previews only, so it sends the text the row was written with; a row written
  without text sends `''`, exactly the message of images alone it always was.
- **Local slots use local names.** `PendingUploadSlot` is `{ localStatus, localThumbUrl }` (plus
  `localName` / `localContentType` / `localSize` for a video or document), never
  the server's `status` / `error` / `url` / `thumbnail`. The server's `'failed'` is terminal and a
  local `'failed'` can be retried, and a reader that met the same name would take one for the other.
  `isPendingUploadSlot` tells them apart inside one `upload$$` list.
- **The slot type lives in the cache contract** (`@chatic/app-messages`, `CacheChatView.upload$$`).
  The chat storage port is typed by that contract, so a slot that only the domain model knew about
  could be read but not written. The native shell stores a chat row as a JSON blob, so the wider
  type asks nothing of it.
- **The rows survive a reload.** The web cache never evicts unsent rows (`chatNo: 0`), and the native
  cache keeps the whole row. The files do not survive: a `File` cannot be stored. That is why the app
  sweeps the leftovers when it attaches to a channel — see
  [the image send hook](../../../app-runtime/docs/data/image-send.md).
- **Reaching unsent rows takes two flags.** The web store appends them when asked with
  `includeUnsent`. The native store ignores that flag but honours `sort`, and ascending order puts
  `0` first. `listPendingImageChats` asks for both.

## How to verify

```bash
npx jest --config libs/data/jest.config.js libs/data/src/uploads libs/data/src/remote/socket-data-sources/UploadSocketDataSource libs/data/src/repositories/ChatRepository
```
