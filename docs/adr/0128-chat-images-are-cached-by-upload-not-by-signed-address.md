# ADR-0128: Chat images are cached by upload, not by signed address

> Status: Accepted · Decided: 2026-09-29 · Implemented: `feat/chat-image-cache`
> · Scope: apps/web `features/channels` (`lib/imageCache.ts`, `lib/imageCacheStore.ts`,
> `hooks/useCachedImages.ts`, `MessageImages`) · `@chatic/web-ui-kit` `ImageViewer`, `MessageImageTiles`
> · Builds on: [ADR-0123](./0123-picking-a-photo-sends-it-and-the-shell-decides-how-it-is-picked.md)
> (where `MessageImages` and its expiry re-read were decided)
> · The module doc is [apps/web/docs/feature/channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md)

## Context

A chat image reaches the page as a signed S3 address in the message's `upload$$` — a thumbnail
(`thumbUrl`, 512px) and the original (`orgUrl`, uploaded as picked). Images loaded slowly, and on
the dev servers this was measured:

- **The address changes on every read.** The server rounds the signing time to the hour, but
  `X-Amz-Security-Token` differs between reads of the same message within that hour. A room opened
  from the cache drew its images at ~1.0 s, and when the background re-read landed at ~2.9 s every
  image had a new address. The browser caches by full URL, so every image was downloaded again.
  The objects carry no `Cache-Control` either, so even an unchanged address was only heuristically
  fresh.
- **An expired address costs three round trips.** An address lives two hours (`X-Amz-Expires=7200`).
  A cached row past that fails, the message is re-read for fresh addresses, and only then does the
  image load.
- **The viewer waits for the whole original.** A picked photo is uploaded without resizing, so the
  original was several megabytes (a 3024×4032 test image was 7–8 MB), and the viewer was black until
  all of it arrived.
- **The dev bucket answers CORS with `*`** — checked with the production and dev page origins and
  `null` as `Origin` — so the page can `fetch` the bytes itself. Whether the production bucket allows
  CORS is not established; decision 2 covers a bucket that does not.

## Decision

1. **The page keeps the image bytes, keyed by cloud + upload id + variant** (`<cid>/<uploadId>/thumb`
   or `/org`). A drawn image is looked up in memory (object URLs), then in its own IndexedDB
   database, `ChaticImageCacheDB`, and only on a miss is its signed address fetched once. A new
   address for a kept image costs nothing, and an expired one does not matter while the image is
   kept. The cloud is part of the key because an upload id is only unique inside the server that
   issued it — the dev relay hands out sequential ones.
2. **The signed address stays the fallback and the failure signal.** When the fetch cannot be made —
   403, no CORS, offline, a body that is not an image — the `<img>` draws the signed address exactly
   as before, and the existing expiry re-read (`useImageAddressRefresh`) runs from its error. A kept
   copy that fails to decode is dropped, and that image falls back to its address. The cache must never
   leave an image worse off than drawing its address: a store read slower than a second is a miss, and
   after a fetch that got no answer at all (CORS, network) loads skip fetching for a minute rather than
   make every image wait for the same failure.
3. **Only what is drawn is asked for.** The four visible tiles of a message, and in the viewer the
   showing original and its two neighbours, plus their thumbnails. No original is fetched before the
   viewer opens.
4. **The viewer draws the thumbnail under the original** until the original has loaded, so it opens
   on a picture rather than on black.
5. **Budgets, least recently used first:** 50 MB of thumbnails and 150 MB of originals on disk, each
   counted separately so a few opened photos cannot push every thumbnail out; 40 MB of object URLs
   in memory that nothing is drawing. An image being drawn is never revoked, and memory is swept a
   second after a release rather than at it — a redraw releases and re-takes its images in one commit,
   and revoking in between would reload what is on screen.

## Alternatives

- **Make the address stable on the server** — sign with a credential that does not change per read,
  or serve through CloudFront with signed cookies — and set `Cache-Control: immutable` on the
  objects. This is the better fix at the HTTP layer and would help every client, desktop included,
  without any storage of our own. It is a server change, outside this repository. The page cache stays
  useful after it: it also covers expiry and a cold launch.
- **Keep the old `src` when only the query changes.** This stops the re-read from re-downloading
  within one page, but not across a relaunch, and an old address that has expired still fails.
- **A service worker that caches by path.** No component would change, but a service worker inside
  the iOS WebView needs App-Bound Domains, which the app does not configure. Not worth the platform
  risk for one feature.
- **The Cache Storage API instead of IndexedDB.** It has no ordered index, so least-recently-used
  eviction would need a second store for the order anyway. IndexedDB is already used by the page.
- **Resize the original before upload.** It would make the viewer faster for everyone, but it
  changes what the recipient receives. That is a product decision, not a caching one.

## Consequences

- A room reopened, or the app relaunched, draws kept images with no network request, including after a
  re-read has handed every image a new address.
- **Access control is weaker for what is already kept.** The signed address is the only access check
  on an image, and a kept copy no longer passes through it: an image stays viewable from this device
  after its address would have expired, or after the account lost access to the room. This is the
  same posture as the chat cache, which keeps the message rows themselves, and a copy is reachable
  only through an upload id that comes from one of those rows. It is not cleared on logout, like the
  chat cache.
- Up to 200 MB of disk for the page, reclaimable by the OS; dropping the database only costs
  downloads.
- A bucket without CORS silently loses the cache — every image falls back to its address, which is
  the old behaviour, plus one failed `fetch` per image.
- `apps/desktop-web` draws chat images with its own components and does not use this cache yet.
