# image send — `useSendImages`

> Status: wired into the room and the thread through the composer's attach button. Canonical code:
> [`hooks/useSendImages.ts`](../../../src/app/features/channels/hooks/useSendImages.ts) (the send) and
> [`components/ChatImageAttach.tsx`](../../../src/app/features/channels/components/ChatImageAttach.tsx)
> (the picking). The sequence it runs is `@chatic/data`'s, documented in
> [libs/data docs/uploads](../../../../../libs/data/docs/uploads/README.md).

`useSendImages({ cid, channelId, parentId? })` sends picked images as one message and returns
`{ sendImages, retry, canRetry, discard }`. It holds no rules about uploads itself. It binds the
data layer's `sendImageMessage` to the room's cloud and to this shell's PUT sender, and it keeps the
picked files for as long as a retry could still need them.

**Everything is addressed to `cid`, the room's own cloud** — the channel row's `cid`, never the
selection. Each pending entry remembers it, every repository call goes through
`runtime.data.getCloudRepositories(cid)`, and the upload and the send run inside
`runtime.data.runInCloud(cid, …)`, which holds that cloud's socket until the send settles. An upload
takes seconds, and a cloud switch in that time used to put the finished message on the next cloud's
socket while its row stayed in the first; now the row, the upload and the send stay together
whichever cloud is on screen by the time it ends.

## What happens on send

1. **A pending row goes into the cache first** (`chat.createPendingImageChat`), with an object-URL
   preview per image, so the message is on screen before anything is prepared or uploaded. The list
   is cut to ten first, so the row never shows a slot that will not be sent.
2. **The sequence runs** on ports the hook binds: `prepare` is `prepareImage(file, CHAT_ATTACHMENT)`,
   `start` / `complete` / `send` are the chat repository's `startUploads` / `completeUploads` /
   `sendPendingImageChat(pendingId, …)`, and `put` is the shell's sender (below).
3. **Sent** — the repository has already swapped in the server's row and read it back once for the
   image addresses, which the send's own answer does not carry. The hook lets the files go and
   revokes the previews.
4. **Failed** — the row is marked failed (`chat.failPendingImageChat`), and the files stay in memory
   so `retry(pendingId)` can send the same pictures again on the same row. `canRetry` turns true only
   once the failure is written, and a retry claims the row before its first await, so a double tap
   runs once. A retry of a row deleted meanwhile answers `false` and lets the files go.

The row starts from the original files' object URLs: the thumbnails do not exist yet when it is
written, and holding the row back until they do would break "the pick is the send". Once every image
is prepared — before the upload starts — the row is rewritten **once**, with a thumbnail preview for
each image that has one (a GIF keeps its original). One cache write per message, not per image, and
the feed stops decoding full-size photos for small tiles. A retry keeps the thumbnails it already has.
While a message is still on its way its viewer shows that preview, not the original.

## Which PUT

`bridge/shellUpload.ts` decides once per page, at the bridge seam:

| Shell                                | PUT                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| browser                              | `xhrPut` — the page's own `XMLHttpRequest`                                             |
| app with the transfer module         | `nativePut` — temp file, `StartFileTransfer`, wait for the terminal state, acknowledge |
| app built before the transfer module | `xhrPut`, after the first request comes back `NOT_FOUND`; remembered for the page      |

The native path keeps moving bytes with the app in the background. It writes one temp file at a
time — each write holds a whole photo as base64 in page memory — while the transfers themselves
overlap. The fallback does not keep going in the background: it only runs while the app is in front,
and a PUT cut off by the background, or one stalled past its five-minute timeout, comes back as a
network failure, which the sequence retries. `runtime/upload/` holds the two senders and the transfer catch-up, each
taking the bridge it talks through, so none of them reaches for `webClient` itself.

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

The native shell may also have finished transfers while the page was away. The hook catches up
(`ListFileTransfers` → settle → `AckFileTransfers`) on attach and whenever the app comes back to the
front. A finished transfer this page never started is acknowledged and dropped: the message it
belonged to lived in the memory of a page that no longer exists. A transfer this page is waiting on
that the shell no longer holds at all (evicted at its cap for unacknowledged results) is settled as
a failure, so its message cannot hang in "sending".

## Picking — `useChatImageAttach`

The composer's leading button opens the attach menu — photos, camera, files. How photos are picked
depends on the shell:

| Shell                                   | Photos                                                               |
| --------------------------------------- | -------------------------------------------------------------------- |
| app with the photo-library bridge       | recent photos in the menu, and the in-app grid (`PhotoGridSheet`)    |
| app built before the bridge, or browser | the page's own file input, which the WebView hands to the OS chooser |

The page learns which by asking: opening the menu requests the newest photos (`ListPhotos`), and an
app without the handler answers `NOT_FOUND`, which `bridge/photoLibrary.ts` remembers for the page. A
timeout is not learned from. The older app's own photo bridge is not used as a fallback: it ignores
what the page asks for and returns a device path the page cannot read, while the file input returns
real bytes — the profile and channel photo fields already rely on it inside the app.

The camera entry is a capturing file input in every shell, so it opens the camera directly and needs
nothing from the app. Files always use the page's input.

In the grid (`usePhotoPicker`) picks keep their order across albums; one page loads at a time, and a
page that lands after the album changed is dropped. Sending closes the grid and reads the picked photos
one at a time (`ReadPhoto`, base64 — the app converts HEIC to JPEG), so the pending row appears once
they are read. Denied access opens a settings prompt instead of an empty grid; iOS limited access shows
a "choose more" row that re-lists after the system sheet closes.

What is picked is judged before anything is sent (`judgeChatImages` in `@chatic/data`): the four
formats the server takes, 20MB a file, the same photo tapped twice, and ten a message
(`IMAGE_MESSAGE_SLOT_MAX`). The first reason met is shown once; whatever passes is sent at once — there
is no tray and no confirmation, the pick is the send.

The button shares the composer's lock (nobody left in a 1:1, a message being edited). In a thread it
also stays locked until the root is loaded: a reply needs the root's full id, and a photo sent without
one would land in the main feed.

## Rendering

`MessageImages` draws a row's `upload$$` with the kit's `MessageImageTiles` and opens a tapped one in
`ImageViewer`. With no text the images take the bubble's place — an empty bubble beside them would read
as a blank message; with text they sit under it. A pending slot draws from its `localThumbUrl` with its
`localStatus`; a server head from `thumbUrl`, falling back to `orgUrl`. A head the server marks failed,
carries an error, or has no address stays as a broken tile, so the count still matches what was sent.
The tiles are fixed-size: the server embeds no dimensions.

The addresses are signed when the message is read and expire a couple of hours later, and a cached row
keeps them. An image that fails to load draws as a placeholder and the message is read again from its
own cloud (`useImageAddressRefresh`), which writes fresh addresses to the cache; the row redraws with
them. Each dead address is re-read once, so an address that fails again stays a placeholder rather than
looping, and a later expiry — a different address — gets its own re-read. The viewer holds a position
rather than an address, so a refresh reaches it while open. Local previews are never re-read.

The viewer opens at the tapped image and steps through the rest of the message's images, with a
"2 / 3" count. The images sit side by side on a strip: a sideways drag moves it under the finger, and on
release it slides on to the next image or back, the same slide the arrow buttons and keys use. Only the
showing image and its neighbours load. The viewer reaches the images behind the "+n" tile too, and skips
broken ones rather than showing a blank page. It stops at the ends instead of wrapping.

Retry of a failed image row goes to `retry(pendingId)`, not the text path (which would send the row's
empty `content`). Whether it can is asked at the tap, not while drawing — the file map is not React
state, and the send lets a retry in only after it has marked the row failed. A row whose files are gone
— a reload left it behind — answers with a notice to delete it. Deleting
discards the files as well. The home list previews an image-only last message as a photo count.

## Not done here

- **Progress, cancel, a hash.** None are shown or sent.
- **Zoom, save, share in the viewer.** It shows the original and steps between images only.
- **Surviving a reload.** An image message is sent from memory only. A reload or an OS kill mid-send
  loses it, and the row becomes a failed, delete-only leftover.

## How to verify

```bash
npx jest --config apps/web/jest.config.js apps/web/src/app/features/channels/hooks/useSendImages \
  apps/web/src/app/runtime/upload apps/web/src/app/bridge/shellUpload \
  apps/web/src/app/features/channels/components/MessageImages
```
