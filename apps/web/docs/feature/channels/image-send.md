# image send — `useSendImages`

> Status: wired into the room and the thread through the composer's attach button. Canonical code:
> [`hooks/useSendImages.ts`](../../../src/app/features/channels/hooks/useSendImages.ts) (this shell's
> binding) and
> [`components/ChatImageAttach.tsx`](../../../src/app/features/channels/components/ChatImageAttach.tsx)
> (the picking). The send itself — pending row, thumbnail previews, file memory, retry, leftovers —
> is the runtime's `data.useSendImages`, documented in
> [libs/app-runtime docs/data/image-send.md](../../../../../libs/app-runtime/docs/data/image-send.md),
> and the sequence it runs is `@chatic/data`'s
> ([libs/data docs/uploads](../../../../../libs/data/docs/uploads/README.md)).

`useSendImages({ cid, channelId, parentId? })` is that hook bound to this shell: `put` is the
shell's PUT (below), and `beforeSweep` — also run whenever the app comes back to the front — catches
up with the transfers the native shell finished while the page was away. It returns
`{ sendImages, retry, canRetry, discard }`.

## Which PUT

`bridge/shellUpload.ts` decides once per page, at the bridge seam:

| Shell                                | PUT                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| browser                              | `xhrPut` (`@chatic/data`) — the page's own `XMLHttpRequest`                            |
| app with the transfer module         | `nativePut` — temp file, `StartFileTransfer`, wait for the terminal state, acknowledge |
| app built before the transfer module | `xhrPut`, after the first request comes back `NOT_FOUND`; remembered for the page      |

The native path keeps moving bytes with the app in the background. It writes one temp file at a
time — each write holds a whole photo as base64 in page memory — while the transfers themselves
overlap. The fallback does not keep going in the background: it only runs while the app is in front,
and a PUT cut off by the background, or one stalled past its five-minute timeout, comes back as a
network failure, which the sequence retries. `runtime/upload/` holds the native sender and the transfer catch-up, each taking
the bridge it talks through, so neither reaches for `webClient` itself.

The native shell may also have finished transfers while the page was away. The binding catches up
(`ListFileTransfers` → settle → `AckFileTransfers`) on attach and whenever the app comes back to the
front. A finished transfer this page never started is acknowledged and dropped: the message it
belonged to lived in the memory of a page that no longer exists. A transfer this page is waiting on
that the shell no longer holds at all (evicted at its cap for unacknowledged results) is settled as
a failure, so its message cannot hang in "sending". The catch-up reads only uploads from the list: a download there
belongs to the viewer's save or share, which acknowledges it once the file is used
([image-export.md](./image-export.md)).

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
one at a time (`ReadPhoto`, base64 — the app converts HEIC to JPEG and removes the location), so the pending row appears once
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
`localStatus`; a server head from `thumbUrl`, falling back to `orgUrl`. A GIF is sent without a
thumbnail (`prepareChatAttachment` in `@chatic/shared`), so its tile draws the original and plays: a
thumbnail is its first frame only, and the head carries no content type to tell a GIF's thumbnail
from a photo's. A GIF sent before that has a thumbnail and stays still in the row; it plays in the
viewer. A head the server marks failed, carries an error, or has no address stays as a broken tile, so
the count still matches what was sent.
The tiles are fixed-size: the server embeds no dimensions. A tap opens the viewer; a hold opens the
message's action sheet, as on a bubble ([chat-room.md](./chat-room.md#a-message-row)).

The addresses are signed when the message is read and expire a couple of hours later, and a cached row
keeps them. An image that fails to load draws as a placeholder and the message is read again from its
own cloud (`useImageAddressRefresh`), which writes fresh addresses to the cache; the row redraws with
them. Each dead address is re-read once, so an address that fails again stays a placeholder rather than
looping, and a later expiry — a different address — gets its own re-read. The viewer holds a position
rather than an address, so a refresh reaches it while open. Local previews are never re-read.

The viewer opens at the tapped image and steps through the rest of the message's images, with a
"2 / 3" count. The images sit side by side on a strip: a sideways drag moves it under the finger, and on
release it slides on to the next image or back, the same slide the arrow buttons and keys use. Only the
showing image and its neighbours load, and each draws its thumbnail — usually already kept, since the
tile drew it — until the original has arrived, so a large original opens on a picture rather than on
black. The viewer reaches the images behind the "+n" tile too, and skips
broken ones rather than showing a blank page. It stops at the ends instead of wrapping.

The showing image zooms, in the kit's `ImageViewer` with its arithmetic in `imageZoom.ts`. A pinch
scales it around the point between the fingers, up to four times. A double tap on it zooms to 2.5
times at that point, or back out. While it is zoomed, a one-finger drag pans it instead of turning
the page, and the photo's edge cannot be pulled off the page. A tap beside a zoomed photo does not
close the viewer. Turning the page or closing starts the next image fitted again, and a pinch that
ends barely zoomed snaps back. The browser's own pinch is not used: the app fixes the page scale
(`user-scalable=no`), and the browser would zoom the whole screen rather than the photo.

Retry of a failed image row goes to `retry(pendingId)`, not the text path (which would send the row's
empty `content`). Whether it can is asked at the tap, not while drawing — the file map is not React
state, and the send lets a retry in only after it has marked the row failed. A row whose files are gone
— a reload left it behind — answers with a notice to delete it. Deleting
discards the files as well. The home list previews an image-only last message as a photo count — the kind rule for every attachment is in
[home's last-chat.md](../home/last-chat.md#what-the-row-prints).

### The image cache

What a server head draws is read through a cache keyed by the image, not by its address
(`lib/imageCache.ts`, `hooks/useCachedImages.ts`). The key is `<cid>/<uploadId>/thumb|org`: an upload's
bytes never change, while its signed address changes on every read of the message. The signing time is
rounded to the hour, but the signing credential's token differs from read to read, so a browser cache
keyed by URL missed every time. A room opened from the cache drew its images, the background re-read
handed the same images new addresses, and all of them were downloaded again. The cloud is in the key
because an upload id is only unique inside the server that issued it.

A drawn image is looked up in memory (object URLs), then in the page's own IndexedDB database
`ChaticImageCacheDB` (`lib/imageCacheStore.ts`, apart from `libs/db`'s chat cache because there is
nothing to migrate with it), and only then fetched once from its signed address. While it is looked up
the tile is an empty square. Nothing races a download of the address alongside the lookup, because
that download is exactly what the cache saves. A key already in memory resolves in the same render, so
a redraw with a new address does not blink.

- **The signed address is the fallback and the failure signal.** If the fetch cannot be made — a 403
  from an expired address, a bucket without CORS, offline, a body that is not an image — the tile draws
  the address directly, and the expiry re-read above runs from its error as it always did. A kept copy
  that fails to decode is dropped and falls back the same way, without a re-read: its address was never
  the problem.
- **Never worse than the address.** A store read that takes more than a second counts as a miss, so a
  hung IndexedDB open cannot hold every tile blank; the store also lets go of a connection that was
  closed or upgraded elsewhere and opens a new one. After a fetch that got no answer at all, loads skip
  fetching for a minute and draw addresses directly.
- **Only what is drawn is asked for:** a message's four visible tiles, and in the viewer the showing
  original and its two neighbours, with their thumbnails. No original is fetched before the viewer
  opens — except for a tile with no thumbnail, a GIF, which draws its original and keeps it under the
  `org` key, where the viewer finds it too — and the neighbours' originals only once the showing one
  is in, or has fallen back to its address: fetched side by side, three originals of several MB split
  a slow network three ways, and the photo being looked at took three times as long. Until then a
  neighbour draws only what memory already has (so the photo sliding out does not drop to its
  thumbnail), and a neighbour still downloading, the photo just swiped away from, is let go and
  cancelled with the rest below.
- **A download nobody draws is cancelled** at the next sweep (below), unless something took the image
  again by then. The bucket answers over HTTP/1.1, so the page gets about six connections to it. Before
  this, swiping through ten photos on Slow 4G left the originals already swiped past holding all six,
  and the photo on screen, its thumbnail included, stayed black for over a minute behind them. A
  cancellation is not a failure: it does not start the one-minute fetch pause.
- **Budgets:** 50 MB of thumbnails and 150 MB of originals on disk, evicted least recently used first
  and counted apart, so a few opened photos (an original is uploaded as picked, often several MB) cannot
  push every thumbnail out. A hit moves an image's place in that order at most once an hour. In
  memory, up to 40 MB of object URLs that nothing is drawing stay around, ordered by when they were last
  drawn. An image being drawn is never revoked, and memory is swept a second after a release: a redraw
  lets go of its images and takes them again in one commit, and the render reads the cache a frame
  before its effect takes them.
- **Kept past its address.** A kept image stays viewable after its address would have expired, or after
  the account lost access to the room — the same posture as the chat cache, which keeps the rows
  themselves. Neither is cleared on logout.

The trade-offs, and the server-side fix that would make the address itself cacheable, are recorded in
[ADR-0128](../../../../../docs/adr/0128-chat-images-are-cached-by-upload-not-by-signed-address.md).

## Not done here

- **Upload progress, cancel, a hash.** None are shown or sent.
- **Save and share from a tile.** The viewer has them inside an app that can
  ([image-export.md](./image-export.md)); a tile does not. A right-click on a tile opens the
  message's action sheet, not the browser's image menu (ADR-0136).
- **Surviving a reload.** An image message is sent from memory only. A reload or an OS kill mid-send
  loses it, and the row becomes a failed, delete-only leftover.
- **A cacheable address.** Making the signed address stable across reads, and giving the objects a
  `Cache-Control`, is the server's side and not done; the page cache above works around it.
- **A display-size original.** The viewer opens the original as uploaded. A smaller copy for the screen
  would need the server to make one, or the send to resize the original — a product decision.

## How to verify

```bash
npx jest --config apps/web/jest.config.js apps/web/src/app/features/channels/hooks/useSendImages \
  apps/web/src/app/runtime/upload apps/web/src/app/bridge/shellUpload \
  apps/web/src/app/features/channels/components/MessageImages \
  apps/web/src/app/features/channels/components/ChannelMessageRow \
  apps/web/src/app/features/channels/lib/imageCache apps/web/src/app/features/channels/hooks/useCachedImages
```

The send itself and `xhrPut` are tested where they live — see the runtime doc and
[libs/data docs/uploads](../../../../../libs/data/docs/uploads/README.md).

To see the cache work, send a photo in a room, reload, and open the room again: the tiles' `src` are
`blob:` addresses, `ChaticImageCacheDB` holds one `meta` row per image, and a `PerformanceObserver` on
`resource` entries sees no request to the bucket when the room is left and re-entered.
