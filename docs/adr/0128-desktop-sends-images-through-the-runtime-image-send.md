# ADR-0128: desktop sends images through the runtime's image send, the text first

> Status: Accepted · Decided: 2026-09-29
> Scope: `libs/app-runtime/src/data/hooks/useSendImages.ts` · `libs/data/src/uploads/xhrPut.ts` ·
> `apps/web/src/app/features/channels/hooks/useSendImages.ts` ·
> `apps/desktop-web/src/app/features/chat/**` (`useComposerSend` · `useChatImages` · `chatImages` ·
> `imageActions` · `Composer` · `ChatPane` · `ThreadPanel` · `MessageRow` · image components)
> Supersedes: [ADR-0082](./0082-desktop-message-images-client-side-seam.md) Decision 2 (sending with
> attachments is rejected), and changes what Decision 1's reader reads
> Related: [ADR-0121](./0121-an-image-send-runs-in-the-data-layer-over-a-put-port.md) (the send
> sequence and its PUT port) · [ADR-0122](./0122-a-chat-send-is-addressed-to-the-cloud-it-was-written-in.md)
> (a send is addressed to the cloud it was written in)

## Context

ADR-0082 built the desktop image UI before the server could take images. It kept every read behind
`useChatImages`, and it refused any send that had pictures in the tray. The server side and the send
sequence now exist (ADR-0121), and apps/web held the only hook that drives them, not wired to a
screen. Desktop needed that hook, but an app cannot import another app's code. So the choice was
whether to copy it or to move it.

Two more questions came with it.

- **Text and pictures together.** An image message is written with empty content
  (`ChatRepository.createPendingImageChat`), and it is unverified whether the server takes content
  and uploads on one message.
- **Which way round.** The Figma cases ADR-0082 cites put the text above the images.

## Decision

### 1. One image send, in the runtime

The orchestration (pending row, file memory, retry, attach-time sweep) moves from apps/web to
`@chatic/app-runtime` as `data.useSendImages`. What differs between shells enters as two ports:
`put` (the page's `xhrPut`, or the native transfer) and `beforeSweep` (the native catch-up). The
page's `xhrPut` moves to `@chatic/data`, next to the `PutPort` it implements. apps/web keeps a thin
binding. Desktop binds `xhrPut` alone, because the Electron renderer is a page and there is no
native transfer on desktop. The runtime can host it because it already depends on data, shared and
bridges, and it already publishes React hooks. `@chatic/data` could not, because the hook needs the
runtime's cloud-addressed graph.

### 2. Text and pictures are two messages, the text first

A send with both puts the text out at the press, then the pictures as one image message. That keeps
the design's "text above images" without any waiting: the image message reaches the server only after
its uploads, so it takes the higher number. The two fail apart. A picture send that fails keeps its
own Failed row with Retry and Delete, and the text is already out.

### 3. The reader reads the message

`useChatImages(message)` maps the message's `upload$$`. It shows local previews while the message is
sending, and the server's signed thumbnail and original once it has been sent. It falls back to
ADR-0082's debug sample store only for a message with no uploads of its own. "Delete file" stays
limited to those samples, because there is no server delete for an upload.

### 4. `canRetry` is reactive

The runtime's pending-file map lives outside React. Every change bumps a version that the hook
subscribes to, and `canRetry` comes back as a new function when the version moves. The failure write
re-renders a row before the entry leaves flight, so without this a memoised row would never show its
Retry.

## Alternatives

- **Copy the hook into desktop-web** — rejected. It would be two copies of the retry, leftover and
  cloud-addressing rules, and the next fix would land in one of them.
- **One message carrying text and uploads** — rejected for now. It needs `ChatRepository` and the
  send contract to change, and the server's acceptance of it is unverified.
- **Pictures first, then the text once they settle** — first chosen, then reversed. It contradicts
  the design, and it holds the text back for the length of an upload.

## Consequences

- Desktop sends images. The Electron main process is unchanged, because the page PUTs from its own
  origin.
- The storage bucket's CORS has to allow the page origin (the hosted desktop-web, and
  `CUSTOM_UI_ORIGIN` where it is used) for the PUT, and a GET for "copy image". Code cannot fix a
  missing entry. The PUT then fails as a network error, and the message shows Failed.
- A sent image has no file name on the server, so it is named `image-N`, and a saved copy takes its
  extension from the bytes.
- A message's image addresses come from the server and other members, so only `https:` (and the
  page's own `blob:` / `data:image/`) is loaded, saved or copied, and the fetch sends no cookies.
  Anything else shows as an image that failed.
- Saving a sent image fetches it first. Chromium ignores `download` on a cross-origin link and
  navigates instead.
- Signed addresses expire. An old row shows broken tiles until the feed is read again.

## When to reverse

If the server accepts content and uploads on one message, Decision 2 becomes a single send.
`useComposerSend` is the one place that splits them.
