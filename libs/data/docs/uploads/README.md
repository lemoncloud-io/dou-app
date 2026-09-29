# uploads — sending images as one chat message

> Status: Live (not wired to a screen yet) · Last updated: 2026-09-28 · Overview in the [lib README](../../README.md) · Canonical code: [uploads/](../../src/uploads/) · The socket half in [remote/socket.md](../remote/socket.md#upload)

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
- **At most ten images.** Anything past the tenth is left out. The screen is meant to stop the user
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
  marks the other slots itself. The message fails only when nothing is stored.
- **A thumbnail never fails its slot.** If the thumbnail PUT fails, the slot still counts as done and
  the server keeps the original without a preview.
- **A socket operation failing is the message failing.** That covers `start`, `complete`, `send`, and
  an answer the guard rejects. A retry starts over from step 1. Uploads the failed attempt had
  already stored are abandoned, and the server clears them within a day. That waste is accepted
  rather than tracking upload ids across attempts.
- **A failed re-issue fails only its slot.** The other slots still hold valid tickets.

Retry and re-issue live here and nowhere else. A PUT port reports what happened and never decides,
so the web sender, the native sender and the old-app fallback cannot come to different conclusions.

## The response mirror

The SDK names the upload responses (`UploadStartResult`, `UploadTicket`, …), but it re-exports them
from `lemon-model/upload`, and the root `resolutions."lemon-model"` pin (1.2.2) predates that entry
point. Under `skipLibCheck` every one of those names silently becomes `any`.

So `uploads/types.ts` carries the shape itself, with only the fields read here: each slot's
`upload.id` · `upload.status` · `transfer` · `thumbnailTransfer`, the `url` and `headers` of a
transfer, and `id` · `status` · `error` from `complete`. `UploadSocketDataSource` runs every answer
through `parseUploadStartResult` / `parseUploadCompleteResult`. An answer of the wrong shape rejects
the whole operation, and the error names the path, never the value. **The mirror goes away when the
pin reaches `lemon-model` 1.5.**

## Tickets are credentials

A transfer's `url` and `headers` authorise one PUT. They are never logged, persisted or put in an
error message. The guard copies them into a fresh object, the sequence's logs carry slot indexes and
HTTP statuses only, and error logs carry an error's name, not its message. A transport message can
quote the request it failed on.

## Pending image rows

`ChatRepository` owns the row. The sequence only reports its outcome.

| Method                                                             | What it does                                                                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPendingImageChat({ channelId, parentId?, localThumbUrls })` | writes the optimistic row, one `{ localStatus: 'sending', localThumbUrl }` slot per image                                                                       |
| `createPendingImageChat({ …, pendingId })`                         | re-arms that same row for a retry: `sending` again, not a second row                                                                                            |
| `sendPendingImageChat(pendingId, { uploadIds })`                   | sends the message, swaps the server's row in the way `sendChat` does, then reads it back once with `chat.get` for the image addresses. Throws if the send fails |
| `failPendingImageChat(pendingId)`                                  | marks the row and each slot failed. Leaves a deleted row deleted                                                                                                |
| `listPendingImageChats(channelId)`                                 | the channel's unsent rows that hold pending slots                                                                                                               |

- **A pending row keeps the scope it was written in.** A send takes long enough for a cloud switch,
  so the repository remembers each row's scope and reads, fails and sends it there. A send whose
  active cloud is no longer the row's throws instead of posting the uploads to the wrong cloud. A
  re-arm of a row that was deleted meanwhile throws too, rather than recreating it without a channel.
- **A sent message is read back once.** `chat.send`'s answer names the uploads but not where to fetch
  them: its `upload$$` is `{ id, status, stereo }`. The sender gets no broadcast of its own message
  that could fill the addresses in, which was measured on dev. `chat.get` answers `orgUrl` and
  `thumbUrl`, so the confirmed row reads itself back and the images are there when the send resolves.
  A failed read-back leaves the send's answer in place, since the message went out regardless, and
  the images appear the next time the room reads its feed. Note that `chat.get` omits an empty
  `content` instead of answering `''`.
- **Local slots use local names.** `PendingUploadSlot` is `{ localStatus, localThumbUrl }`, never
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
  [the image send hook](../../../../apps/web/docs/feature/channels/image-send.md).
- **Reaching unsent rows takes two flags.** The web store appends them when asked with
  `includeUnsent`. The native store ignores that flag but honours `sort`, and ascending order puts
  `0` first. `listPendingImageChats` asks for both.

## How to verify

```bash
npx jest --config libs/data/jest.config.js libs/data/src/uploads libs/data/src/remote/socket-data-sources/UploadSocketDataSource libs/data/src/repositories/ChatRepository
```
