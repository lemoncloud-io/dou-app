# attachment send — photos, videos and documents (`useSendImages`)

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
shell's PUT for page files (below), `putShellFile` and `prepareVideo` send and convert the files the
app keeps (inside the app only), `onVideoRefused` shows why the app would not convert a video, and
`beforeSweep` — also run whenever the app comes back to the front — catches up with the transfers the
native shell finished while the page was away. `waitForConnection` (`runtime.data.waitForCloudSocket`)
holds the send for up to ten seconds until the room's socket is back: a pick from an OS picker is
answered as the app returns, while the socket that closed behind the picker is still reconnecting,
and the first request would otherwise fail. It returns `{ sendImages, retry, canRetry, discard }`.

## Which PUT

`bridge/shellUpload.ts` decides once per page, at the bridge seam:

| Shell                                | PUT                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| browser                              | `xhrPut` (`@chatic/data`) — the page's own `XMLHttpRequest`                            |
| app with the transfer module         | `nativePut` — temp file, `StartFileTransfer`, wait for the terminal state, acknowledge |
| app built before the transfer module | `xhrPut`, after the first request comes back `NOT_FOUND`; remembered for the page      |

**Only a photo crosses the bridge.** A page file that is a video or a document goes up by `xhrPut`
even inside the app: the native path would first copy it to the shell as base64 in one message, and a
WebView does not survive that for a 300MB file. The picked `File` is handed over as it is, which the
browser streams from disk. A file the app keeps (`ShellFileRef`, from the app's own picker, below) goes
through `putShellFile`: `StartFileTransfer` with the shell's own address and the declared size, no temp
file. It has no page fallback — only an app with the transfer module makes such files — so one that
reaches an older shell fails its slot.

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

The composer's leading button opens the attach menu — photos, camera, files. "Files" opens a second
sheet (`AttachSourceSheet`): choose from the album (photos and videos) or from files (documents). How
photos are picked from the photos entry depends on the shell:

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
nothing from the app. The photos entry, the grid and the camera take photos only.

The second sheet's two entries depend on the shell too:

| Shell                                   | Choose from album / Choose from files                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| app with the attachment picker          | `PickAttachments` — the OS photo-and-video picker, or the documents picker, through the app |
| app built before the picker, or browser | the page's own file input: photos and `mp4`, or the seven document formats                  |
| …on iOS or iPadOS WebKit                | the album input takes photos only, and the sheet says where videos can be sent from         |

In the app the shell copies what was picked into its own folder and answers with addresses, never
bytes (`bridge/attachmentPicker.ts`). Photos picked alongside are kept there too, already prepared like
the grid's, and the page reads their bytes one photo at a time (`ReadAttachment`, two minutes each) in
pick order: the page resizes every photo itself, and ten photos in the pick's own answer would be some
200MB of base64, enough to take the WebView down — the grid reads one at a time for the same reason. A
photo whose read fails is refused alone, as `unreadable`. The pick resolves once every photo is read,
so the pending row appears with all of them.

The page asks at the tap, since the message itself opens the picker. An app without it answers
`NOT_FOUND` within one round trip, and the page then opens its own input in the same tap — as long as
the answer came within 800ms, because iOS lets a page open a file input only within about a second of
the gesture. A slower answer asks for another tap, and from then on the input opens straight away. A
`BUSY` answer — a second tap while the picker opens or copies — shows nothing: the first tap is still
under way. iOS WebKit's own input hands every picked video over as a QuickTime `.mov` after a silent
conversion of up to minutes, and the server takes only `mp4`, so there it is not offered videos at
all, and the sheet says so: inside the app, that an update sends videos
(`chat.attach.source.videoNeedsUpdate`); in a browser, that videos can be sent from the DoU app
(`chat.attach.source.videoInApp`).

A video the app picked may still need converting (an iPhone records HEVC in QuickTime). The send converts
it with `PrepareVideo` after the pending row is shown — the tile is a grey panel until the poster comes.
Which files go through it is decided by the format, not by the shell's `kind`: an `.mp4` picked through
the documents picker is a video too, and is checked and gets a poster. A video the app refuses
(`too-large`: past about four minutes even at 720p; `unsupported`: an Android video that is not H.264)
fails as a message of its own, with a notice that says why. At 720p, the iPhone's last step down, a
minute runs about 76MB, so the 300MB limit lands near 3.9 minutes.

Only a passing failure can be retried. A video refused `TOO_LARGE` or `UNSUPPORTED`, one whose
converted result fails the page's own size check, and one the app lost (`SOURCE` — from `PrepareVideo`,
or from the upload's start, where iOS refuses a file that is gone) would only fail again, so its
message offers delete alone. A conversion that failed in passing (`SYSTEM`, such as the app leaving the
screen mid-way) stays retryable.

In the grid (`usePhotoPicker`) picks keep their order across albums; one page loads at a time, and a
page that lands after the album changed is dropped. Sending closes the grid and reads the picked photos
one at a time (`ReadPhoto`, base64 — the app converts HEIC to JPEG and removes the location), so the pending row appears once
they are read. Denied access opens a settings prompt instead of an empty grid; iOS limited access shows
a "choose more" row that re-lists after the system sheet closes.

What is picked is judged before anything is sent (`judgeChatAttachments` in `@chatic/data`; the photo
entries use its image-only form, `judgeChatImages`): the twelve formats the server takes, each kind's
own limit (20MB a photo, 300MB a video, 50MB a document), the same item picked twice, and ten a message
(`IMAGE_MESSAGE_SLOT_MAX`). What the app's picker would not copy is reported the same way: each of its
refusals carries the item's `kind`, so a too-large one names that kind's limit. The first reason met
is shown once, naming the kind whose limit was passed or what an unknown format looked like;
whatever passes is sent at once — there is no tray and no confirmation, the pick is the send.

The button shares the composer's lock (nobody left in a 1:1, a message being edited). In a thread it
also stays locked until the root is loaded: a reply needs the root's full id, and a photo sent without
one would land in the main feed.

## Rendering

`MessageImages` splits a row's `upload$$` with `chatMediaItems` (`@chatic/data`): photos and videos as
one list of media in the order they were sent, drawn by the kit's `MessageMediaTiles`, and documents as
`MessageFileCard`s below them. A video tile draws its poster (the upload's thumbnail), or a grey panel
without one, with a play mark; no `<video>` is put in the feed, where every video would start a request
just by scrolling past. A tapped photo or video opens in the kit's `MediaViewer`, which plays a video
there and only there (below). With no text the attachments take the
bubble's place — an empty bubble beside them would read
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

The showing photo zooms, in the kit's `MediaViewer` with its arithmetic in `imageZoom.ts`. A pinch
scales it around the point between the fingers, up to four times. A double tap on it zooms to 2.5
times at that point, or back out. While it is zoomed, a one-finger drag pans it instead of turning
the page, and the photo's edge cannot be pulled off the page. A tap beside a zoomed photo does not
close the viewer. Turning the page or closing starts the next image fitted again, and a pinch that
ends barely zoomed snaps back. The browser's own pinch is not used: the app fixes the page scale
(`user-scalable=no`), and the browser would zoom the whole screen rather than the photo.

A video in the viewer is the OS player (`<video controls playsInline preload="metadata">`) over its
poster, fitted between the top and bottom bars so the player's own controls are never under the bottom
bar. It does not zoom. A horizontal drag still turns the page, except one that starts in the bottom
72 px, where the player's seek bar is. Opening a video from its tile tries `play()` within that tap —
Android refuses a play that comes about five seconds after the gesture, so nothing is awaited first, not
even a fresh address; when the play is refused a large play button takes the next tap. Turning away
pauses it, rewinds it and detaches its address, so the download stops; closing pauses it. The player
streams from the signed address with range requests, so no video is cached or fetched ahead — only its
poster is. A player error asks for fresh addresses, as a photo's does. Inside an iOS app built before
inline playback, the play opens the OS full-screen player instead.

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

### Document cards

A card shows the format's icon, the name in two lines with its extension always visible, the size, and
a download button at its right edge. An upload older than names says "File". A pending card draws from
the slot's `localName` / `localSize`, a server-failed one is dimmed and says it cannot be opened.

In a browser the button and the card both download (`lib/fileDownload.ts`): the bytes are fetched into
a `Blob` and saved from a local address under the upload's own name, since an anchor's `download`
attribute names nothing on the bucket's origin. The whole file is in memory meanwhile, which the 50MB
document limit keeps affordable. A 403 means the signed address expired: the message is read again for
fresh ones and the user presses again.

Inside the app the WebView ignores `download`, so the shell does the work (`lib/fileExport.ts`, driven
by `hooks/useFileDownloads`). The shell downloads the file — the button shows the byte progress, and
pressing it again cancels — and the page hands the downloaded file to the OS:

| Press                     | What follows the download                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The button                | `SaveFile` under the upload's name. Saved: a toast says where, with an Open action. The iOS export sheet dismissed: nothing.    |
| The card body             | `OpenFile` — QuickLook on iOS, the system viewer on Android. `NO_HANDLER` (an HWP, usually) puts it on the share sheet instead. |
| A `done` button           | `OpenFile`, as the body.                                                                                                        |
| Long press → "Share file" | `ShareFile`. A message with several documents shares the first one only — one row, rather than a picker inside the sheet.       |

The downloaded file is remembered for the page's life by the card's key, so the card turns `done` and
the next open, save or share hands over the same file without downloading again. The shell keeps the
file after any of the three, and acknowledging the download drops only the shell's record of it. The
recoveries:

- **403, once.** The message is read again for the upload's new address and the download runs once
  more; a second 403 is a failure.
- **`SOURCE`, once.** The OS cleared the file. It is forgotten and downloaded again.
- **`NOT_FOUND` from `OpenFile` or `SaveFile`.** An app built before them. Nothing tells the page up
  front — the handshake only lists the photo messages — so it is learned from that first answer, and
  every card then shows its update notice until the page reloads. A shell with no downloads at all is
  learned the same way.
- **`PERMISSION_DENIED`.** Android 7–9 asks for the storage permission on the first save; a refusal
  says saving needs it and offers the settings.
- **`UNSUPPORTED_TYPE` from `ShareFile`.** An app that shares photos but predates documents: a toast
  asks for an update.
- Anything else says the file could not be downloaded. A cancel, a timeout and a closed sheet say
  nothing.

"Share file" appears only inside an app whose handshake lists `ShareFile` (the check the viewer's photo
share uses), and never in a browser, where the button already saves the file.

## Not done here

- **Upload progress, cancel, a hash.** None are shown or sent.
- **Documents surviving a reload inside the app.** The record of which file the shell downloaded lives
  in the page, so after a reload the card is `idle` again and the next press downloads once more.
- **Save and share from a tile.** The viewer has them for photos and videos inside an app that can
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
  apps/web/src/app/features/channels/components/ChatImageAttach apps/web/src/app/bridge/attachmentPicker \
  apps/web/src/app/features/channels/lib/fileDownload apps/web/src/app/features/channels/utils/attachSources \
  apps/web/src/app/features/channels/components/ChannelMessageRow \
  apps/web/src/app/features/channels/lib/imageCache apps/web/src/app/features/channels/hooks/useCachedImages
```

The send itself and `xhrPut` are tested where they live — see the runtime doc and
[libs/data docs/uploads](../../../../../libs/data/docs/uploads/README.md).

To see the cache work, send a photo in a room, reload, and open the room again: the tiles' `src` are
`blob:` addresses, `ChaticImageCacheDB` holds one `meta` row per image, and a `PerformanceObserver` on
`resource` entries sees no request to the bucket when the room is left and re-entered.
