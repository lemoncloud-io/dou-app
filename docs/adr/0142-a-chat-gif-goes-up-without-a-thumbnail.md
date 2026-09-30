# ADR-0142: A chat GIF goes up without a thumbnail, so the room plays it

> Status: Accepted · Decided: 2026-09-30
> · Scope: `libs/shared/src/image/prepareImage.ts` (`prepareChatAttachment`)
> · `libs/app-runtime/src/data/hooks/useSendImages.ts` · `apps/testbed/src/app/features/image-send/useImageSend.ts`
> · Supersedes, for chat attachments: [ADR-0111](./0111-the-destination-decides-how-a-picked-image-is-prepared.md)'s
> rule that an animated GIF gets a first-frame thumbnail
> · The module docs are [libs/shared README](../../libs/shared/README.md) and
> [apps/web image-send.md](../../apps/web/docs/feature/channels/image-send.md)

## Context

ADR-0111 gave every chat photo a small copy beside the original, and gave an animated GIF one too:
"a first frame is exactly what a list row wants." The original GIF was never redrawn, so the
animation survived in storage.

It did not survive on screen. The room draws a sent image's tile from `thumbUrl`, falling back to
`orgUrl` only when there is no thumbnail. A GIF's thumbnail is a canvas drawing, and a canvas keeps
only the first frame, so every GIF sat still in the list and played only once tapped open in the
viewer. The animation is why someone sends a GIF, so the list showed the one part that did not
matter.

The room cannot fix this on its own side. The upload head the server returns carries `id`,
`stereo`, `status`, `error` and the two signed addresses, and no content type. The storage key is
`uploads/<hash>/original`, with no extension. Nothing in a sent row tells a GIF's thumbnail from a
photo's.

## Decision

**A GIF sent in a chat goes up as its original alone.** `prepareChatAttachment(file)` runs the
`CHAT_ATTACHMENT` policy for every other type, and for `image/gif` asks for the original only. With
no thumbnail declared, the server stores none, the head comes back without `thumbUrl`, and the
room's existing fallback draws `orgUrl`, which plays.

- The pending row already keeps a GIF's original preview when there is no thumbnail, so a GIF plays
  from the moment it is picked, not only after it is sent.
- The image cache keys a tile with no thumbnail under the `org` variant, the same key the viewer
  uses, so the list and the viewer share one download.
- `prepareImage` itself is unchanged: asked for a thumbnail of a GIF, it still makes one. The choice
  belongs to the chat destination, which is ADR-0111's own rule — the destination decides how a
  picked image is prepared.

## Consequences

- **The list downloads the whole GIF.** A photo's tile costs a thumbnail of 30–50 KB; a GIF's costs
  the original, up to the same 20 MB per-file cap. The bytes land in the 150 MB `org` budget of the
  image cache rather than the 50 MB thumbnail one, so a room with many large GIFs pushes opened
  photos out of it sooner.
- **A still GIF loses its thumbnail too.** Telling one frame from many means parsing the file; a
  single-frame GIF simply draws its original, which is small.
- **GIFs sent before this stay still in the list.** Their rows have a thumbnail, and nothing on the
  client can tell they are GIFs. They still play in the viewer.

## Alternatives

- **Detect a GIF on the render side.** Rejected: the head carries no content type and the key no
  extension, as above. Sniffing would mean fetching each original's first bytes, which is the
  download the thumbnail exists to avoid.
- **Keep the thumbnail for large GIFs** (say, above 5 MB). It would bound the list's cost, but a large
  GIF would then sit still for no reason the sender can see. Worth revisiting if the cost shows up.
- **Have the server return the content type on the head.** The exact fix, and it would reach GIFs
  already sent. It is a server change outside this repository; this record does not wait on it.
