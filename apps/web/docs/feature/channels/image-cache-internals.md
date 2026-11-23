# image cache internals — how `ImageCache` and its IndexedDB store behave

What the cache is for, its keys, budgets and the failure fallbacks are in
[image-send.md § The image cache](./image-send.md#the-image-cache). This page holds the mechanics
underneath: how concurrent loads share work, when a download is cancelled, and how the persistent
store is laid out. The code is `lib/imageCache.ts` (the logic, with no browser API of its own) and
`lib/imageCacheStore.ts` (the IndexedDB implementation of its `ImageCacheStore` port).

## Loading, sharing and cancelling

- **One fetch per key.** Loads of the same key share a single in-flight fetch and its promise.
- **A load with a different address joins, then may retry.** A later `load` for a key already being
  fetched from an older address waits for that fetch. If it answers nothing (the older address had
  expired, say), the later load tries once more with its own, newer address, which is the one that
  can still work. If the older fetch was cancelled in the meantime, the waiting load answers `null`
  instead of retrying: nobody holds the key, so the retry would be a download no sweep could reach.
- **A cancelled download is nobody's.** A load that arrives after a download was cancelled starts its
  own fetch instead of inheriting the cancellation.
- **Holders are counted apart from the image.** `retain` and `release` keep a per-key count that is
  separate from the in-memory entry, so an entry can come and go (loaded late, invalidated) without
  losing track of who is drawing it. Retaining a key that is not loaded yet is fine; the count waits.
- **Only a released key counts as abandoned.** A load nobody ever retained is not cancelled. At the
  next sweep a download is cancelled only if its key was released and has not been retained again
  by then, which is what makes a redraw (release and retain in one commit) safe.
- **Memory is ordered by last draw, not by load time.** Retaining or releasing a key counts as using
  it, so a photo loaded first but drawn longest is the last to be dropped.

## `lookup`, `put` and `invalidate`

- **`lookup` never touches the network.** It reads memory, then the store. It is for entries made on
  this device (`frame`). If memory was filled while the store answered, that copy is returned, so
  there is one object URL per key.
- **`put` keeps a copy that is already in memory.** An `<img>` may be drawing it, so the new bytes go
  to the store but the existing object URL is the one returned.
- **Store writes are fire-and-forget.** A failed or unavailable store only costs the next launch a
  download. A trim is scheduled two seconds after a write, and writes that land close together share
  one trim per variant.
- **`invalidate` forgets a key everywhere.** It is for a kept copy that turned out not to decode: the
  caller draws the signed address and the next load fetches afresh. Other holders keep their counts,
  listeners are told so they look the key up again, and the old object URL is revoked at the next
  sweep rather than at once.

## What a load reports

The optional observer (the `image_load` and `image_refresh` samples) is told how each load that left
memory ended:

- A memory hit is not a report, and neither is a load that joined a running one and took its answer.
  A joined load that retries with its own address does report, so one image can report `expired` and
  then `network`.
- A cancelled download is not reported: nobody waited for it.
- Fallback reasons: a 403 is `expired`; any other non-2xx is `http`; a 2xx whose content type is not
  `image/*` is `not_image` (an expired or foreign address answers with an XML body); a fetch that
  threw before any response is `no_answer`, as is a body that broke mid-read.
- Only a fetch that could not be made at all starts the one-minute pause on fetching. A body that
  broke mid-read does not, because the bucket did answer. A cancellation says nothing about the bucket.
- The observer is called inside the cache but never trusted: anything it throws, at the start or
  the end of a load, is swallowed, so measuring cannot cost an image.

## The store — `ChaticImageCacheDB`

- **A database of its own**, apart from the chat model's. It has nothing to migrate with that
  schema, and dropping it loses only downloads.
- **Two object stores.** `meta` holds what the least-recently-used walk needs (size, last use,
  variant), with an index on variant and last use; `blobs` holds the bytes and is read only on a hit.
  Eviction therefore never reads image bytes.
- **Bytes are stored as an `ArrayBuffer`**, not a `Blob`, because older WebKit could not keep Blobs
  in IndexedDB. The cache rebuilds a `Blob` from the buffer and the stored content type so the image
  decodes as what it was. Where `Blob.arrayBuffer` is missing (WebKit before 14), a `FileReader`
  does the conversion.
- **A half record is a miss.** A read needs both the meta row and the blob row; if a write was torn
  by a crash, only one exists and the image is fetched again.
- **Trim runs in one transaction.** It lists a variant's records newest first, adds up their sizes,
  and deletes everything past the point where the total leaves the budget, so a record put or touched
  meanwhile is never deleted on a stale order.
- **A blocked open fails fast.** When another page holds an older version open, waiting would hold
  every image with it. The open is rejected, which the cache treats as a miss, and the next call
  tries again. If the open completes later anyway, that connection is closed straight away because
  nobody is waiting for it.
- **A dead connection is dropped.** On a version change elsewhere, or when the browser closes the
  connection under storage pressure, the store lets go of it so the next call opens a live one
  instead of failing forever. A failed open is likewise retried on the next call, not remembered for
  the life of the page.
