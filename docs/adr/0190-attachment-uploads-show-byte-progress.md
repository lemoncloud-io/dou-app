# ADR-0190: Attachment uploads show byte progress

> Status: Accepted · Decided: 2026-10-12 · Implemented: `feat/upload-progress`
> · Scope: `libs/data/src/uploads/xhrPut.ts` (`xhr.upload` listener) · `libs/data/src/uploads/sendImageMessage.ts`
> (`onProgress`) · `apps/web/src/app/runtime/upload/nativePut.ts` (`running` states)
> · `libs/app-runtime/src/data/hooks/imageSendProgress.ts` · `libs/web-ui-kit/src/composites/chat/ProgressRing.tsx`
> · The module docs are [libs/data uploads](../../libs/data/docs/uploads/README.md),
> [libs/app-runtime data/image-send.md](../../libs/app-runtime/docs/data/image-send.md) and
> [apps/web channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md)

## Context

A photo, video or document on its way showed a spinner and a "Sending…" footer, and nothing else. For
a photo that is a second or two. For a 300MB video or a large document over a phone's uplink it is
minutes of a spinner that says nothing about whether anything is moving, while downloads in the same
feed already fill a ring.

Nothing counted the bytes, by choice. The page's PUT (`xhrPut`) set no `xhr.upload` listener, and the
reason it gave was that such a listener turns every cross-origin PUT into a preflighted one. The
native PUT ignored the transfer module's `running` states and waited for the terminal one, although
both shells already send them for uploads — at most one per transfer every 200 ms — and the bridge
contract already names the upload's length as the progress denominator.

The preflight reason does not hold. A browser preflights a cross-origin request when its method is not
one it sends unasked *or* an upload listener is set. PUT is never such a method, so every PUT here was
preflighted already, and signed URLs are unique, so none reuses a cached preflight either. Measured
from a local dev page against the dev bucket in Chrome, a PUT to a new URL took the same time with the
listener as without (median 96 ms against 97), each about 25 ms above a repeat to the same URL; the
bucket's CORS answers the preflight for PUT with `content-type`. A real send with the listener on went
through unchanged.

## Decision

1. **The PUT ports may count.** `PutPort` and `ShellFilePutPort` take an optional `onProgress(sentBytes)`.
   `xhrPut` sets `xhr.upload.onprogress` only when it is given one. The native sender hands each
   `running` state's `transferredBytes` to the transfer it belongs to, and stops at the terminal state.
2. **The sequence adds a slot up.** `sendImageMessage` reports per slot the bytes of its original and
   thumbnail together, out of both sizes — restarting a PUT's count when it is retried, ending full
   when the slot is done, and saying nothing more of a slot that failed.
3. **The count stays in page memory.** `useSendImages` records a ratio per slot, by its place in the
   pick, in a module-level store keyed by pending row, and `data.useImageSendProgress(pendingId)`
   reads it. It is never written to the cached row.
4. **The screen draws a ring when it knows, a spinner when it does not.** A sending tile fills a ring
   with the percentage inside it; a sending document card fills one and shows "sent / size" in place
   of its size. A slot that has not started counting keeps the spinner. The ring is the download
   ring, moved out of the file card so both use it.

## Consequences

- A large upload says how far it has gone, in the browser and inside the app, with no extra request.
- Up to five state updates a second per running transfer reach the page. Rounded to whole percents and
  kept per row, a tick that moves less than one percent renders nothing, and one that does renders
  only its own message.
- The ring is full a moment before the message is: the send and its read-back still follow the last
  byte. It reads as done-but-finishing, which is what it is.
- A retry visibly starts over, since its PUT sends from the first byte.
- `apps/desktop-web` runs the same sequence and store but does not draw the progress yet; its tiles
  still spin.
- Inside the app, a slot whose source the shell has not sized reports no total and keeps the spinner.

## Alternatives

- **Write the progress onto the pending row.** Rejected: the row lives in the cache, and every write
  re-reads and re-renders the feed. A 300MB video would write several times a second for minutes,
  for state a reload throws away anyway.
- **One ring per message rather than per slot.** Rejected: a message of ten photos shows ten tiles,
  and each tile already has its own sending state. Per slot also keeps a failed slot's ring from
  holding the others back.
- **Count only the original.** Rejected: the thumbnail goes after it, so the ring would sit at 100%
  while bytes still move. It is small, so adding it costs nothing visible.
- **Keep the spinner and show an indeterminate "still sending" after a while.** Rejected: it answers
  "is anything happening" but not "how long", which is the question a minutes-long video raises, and
  the bytes were already counted on both sides for free.
