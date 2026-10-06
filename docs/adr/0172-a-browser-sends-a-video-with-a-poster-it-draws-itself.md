# ADR-0172: A browser sends a video with a poster it draws itself, and a phone draws the frame of one that came without

> Status: Accepted · Decided: 2026-10-06 · Implemented: `feat/video-poster-and-grid-videos`
> · Scope: `libs/shared/src/image/videoPoster.ts` · `libs/app-runtime/src/data/hooks/useSendImages.ts`
> (`prepareAttachment`) · `apps/web/src/app/features/channels/` (`lib/videoFrames.ts`, `hooks/useVideoFrames.ts`,
> `lib/imageCache.ts`, `MessageImages`) · `libs/web-ui-kit` `MessageMediaTiles` (`frameUrl`) ·
> `libs/app-messages` `ReadVideoFrame` · the iOS and Android `AttachmentPicker` modules
> · Replaces the "no thumbnail" part of [ADR-0148](./0148-desktop-sends-videos-and-documents-as-they-are.md)
> for videos; its documents are unchanged.
> · The module docs are [libs/app-runtime image-send.md](../../libs/app-runtime/docs/data/image-send.md),
> [apps/web channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md),
> [apps/desktop-web chat/images.md](../../apps/desktop-web/docs/chat/images.md) and
> [apps/mobile native/attachment-picker.md](../../apps/mobile/docs/native/attachment-picker.md)

## Context

A video sent from the desktop or from a phone's browser went up with no thumbnail (ADR-0148): the
send's preparation step resized images and passed everything else through. The desktop feed did not
mind — it lays a `<video preload="metadata">` in the message and the browser draws the first frame.
The mobile feed does mind. Its tiles draw a thumbnail and never place a `<video>`, so those videos
were grey panels with a play mark, and people reported them as broken.

A video picked in the app already had a poster: the shell's `PrepareVideo` draws one (400 px on the
long side, at most 200,000 bytes, 0.5 s in) and uploads it as the thumbnail. The server keeps a
thumbnail only when it is an image of at most 200,000 bytes and drops a larger one without an error.
It never makes one itself, so a video already sent without one stays without one.

Two things were measured before deciding:

- The obvious browser routine — load the file, set `currentTime = 0.5`, draw on `seeked` — does not
  finish on iOS WebKit: `seeking` arrives and `seeked` never does. A URL fragment (`#t=0.5`) set
  before the load does. Android's WebView reports `seeked` before the frame is readable: drawn at once
  the canvas was blank in 10 of 17 tries, and right in 17 of 17 after 300 ms.
- The iOS app's WebView loads no media at all before a tap. `mediaTypesRequiringUserActionForPlayback`
  is `.all` (React Native's default), and that blocks the load, not only playback — `blob:` addresses
  included. A page in the iOS app cannot draw any video frame.

## Decision

### 1. The browser draws the poster of a video it sends

`makeVideoPoster(file)` in `libs/shared` draws the frame with the shells' rule and the routine
measured above: seek by fragment, wait 300 ms after the frame is reported, check the frame is not
blank and try once more if it is, then encode a JPEG from quality 0.7 down until it fits 200,000
bytes. `prepareAttachment` calls it for a page `File` video and sends the result as the thumbnail.
Desktop and mobile web share the hook, so both change at once.

A poster that cannot be made — a codec the browser cannot decode (HEVC in most Chromium builds), ten
seconds without a frame, a frame still blank — means the video goes without one. A poster is never a
reason not to send.

### 2. A phone draws the frame of a video that came without one

For a sent video slot with no `thumbUrl`, in this order: the server's thumbnail (nothing else runs),
a frame this device made before and kept in the image cache under a new `frame` variant, or a frame
made now. Making one reads the remote video, so it runs only for tiles on screen, two at a time, and
a request still waiting when its tile scrolls away is dropped.

- **In the app the shell makes it**: `ReadVideoFrame { url, atMs: 500, maxEdge: 400 }`, answered by
  `AVAssetImageGenerator` on iOS and `MediaMetadataRetriever` on Android, straight from the signed
  address. The shell reads ranges itself, so no CORS is needed, and nothing it reads is written to
  disk. The WebView setting stays as it is.
- **In a browser the page makes it** from the video's first 2 MiB, fetched with CORS and
  `cache: 'no-store'`, with the same routine as the poster. Where that does not draw — the bucket
  sends no CORS headers, the index is at the end of the file, a high-bitrate first frame lies past
  2 MiB — the tile draws a muted `<video preload="metadata" src="…#t=0.5">` of its own that never
  plays. Whether the bucket allows CORS is learned from the first fetch, once per session.
- **An app from before `ReadVideoFrame`** answers `NOT_FOUND`. Android then uses the `<video>` path,
  which its WebView draws. iOS stays grey, since its WebView would load nothing.

## Consequences

- Every new video from a browser shows a frame on a phone. One the browser cannot decode still shows
  grey until a phone draws its frame.
- The server is unchanged. Videos sent before this are not given a poster after the fact; each phone
  draws the frame once and keeps it (20 MB of frames per device).
- Old iOS apps keep the grey panel for posterless videos until they update.
- A tile on the `<video>` path makes several range requests to the bucket each time it is drawn and
  has only the browser's HTTP cache. That is the cost of a bucket without CORS, and it is paid only
  for tiles on screen.
- `MessageMediaTiles` now places a `<video>` element in the feed, but only when the host hands a tile
  a `frameUrl`. The rule that the feed never plays a video stands.

## Alternatives

- **Have the server make thumbnails.** It would cover old videos and every client at once, but the
  server does no media processing, and changing the server is out of scope here.
- **Upload the frame a phone draws as the missing thumbnail.** It would fix old videos for everyone,
  but a reader would be writing to someone else's upload, and the upload API has no such operation.
- **Seek with `currentTime`.** Simpler, and it never finishes on iOS WebKit.
- **Let the iOS WebView load media before a tap** (`mediaTypesRequiringUserActionForPlayback = []`).
  It would let the page draw frames itself. It would also let any page in the WebView start loading
  and playing media without a gesture, which is a behaviour change across the whole app for one tile.
- **Only the `<video>` element, never a cached image.** No CORS question at all, but every visit
  reads every visible video again, and it does nothing in the iOS app.
