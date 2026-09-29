# image send — `useSendImages`

> Status: wired into the room and the thread through the composer's attach button. Canonical code:
> [`hooks/useSendImages.ts`](../../../src/app/features/channels/hooks/useSendImages.ts) (the send) and
> [`components/ChatImageAttach.tsx`](../../../src/app/features/channels/components/ChatImageAttach.tsx)
> (the picking). The sequence it runs is `@chatic/data`'s, documented in
> [libs/data docs/uploads](../../../../../libs/data/docs/uploads/README.md).

`useSendImages({ channelId, parentId? })` sends picked images as one message and returns
`{ sendImages, retry, canRetry, discard }`. It holds no rules about uploads itself. It binds the
data layer's `sendImageMessage` to this page's repository and to this shell's PUT sender, and it
keeps the picked files for as long as a retry could still need them.

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

The preview is the original file's object URL. The thumbnail does not exist yet when the row is
written, and re-writing the row once it does would cost a cache write per image.

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

The composer's leading button opens the attach menu — photos, camera, files — and every entry is the
page's own file input, in the app as much as in a browser. The app's WebView hands a file input to the
OS chooser, and it returns real bytes; the photo-library bridge of an app built before this feature
ignores what the page asks for and returns a path the page cannot read. The camera entry has its own
input with `capture`, so it opens the camera directly; photos and files share one without it.

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

Retry of a failed image row goes to `retry(pendingId)`, not the text path (which would send the row's
empty `content`). Whether it can is asked at the tap, not while drawing — the file map is not React
state, and the send lets a retry in only after it has marked the row failed. A row whose files are gone
— a reload left it behind — answers with a notice to delete it. Deleting
discards the files as well. The home list previews an image-only last message as a photo count.

## Not done here

- **Progress, cancel, a hash.** None are shown or sent.
- **Surviving a reload.** An image message is sent from memory only. A reload or an OS kill mid-send
  loses it, and the row becomes a failed, delete-only leftover.

## How to verify

```bash
npx jest --config apps/web/jest.config.js apps/web/src/app/features/channels/hooks/useSendImages \
  apps/web/src/app/runtime/upload apps/web/src/app/bridge/shellUpload
```
