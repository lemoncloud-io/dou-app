# ADR-0082: desktop-web message images are client-only until an upload API exists — kept behind one

reader, and sending is rejected

> Status: Accepted · Decided: 2026-09-11 · Implemented: `da34a447` · `8d167f16` (PR #446)
> Scope: `apps/desktop-web/src/app/features/chat/**` (image components · `useChatImages` ·
> `useChatImagesStore` · `useImageAttachments` · `Composer`) ·
> `apps/desktop-web/src/app/features/debug/pages/DebugImagesPage.tsx` ·
> `apps/desktop-web/tailwind.config.js`
> Related: Figma "DoU PC" 247:10714 (image cases · planning notes), dark palette 254:541 · 259:566 ·
> [ADR-0049](./0049-feedback-photo-attachment-inline-base64.md) (feedback photo attachment — a different
> surface, a different decision)

## Context

Figma "DoU PC" 247:10714 defines six cases for message images.

- The menu and close button reveal on hover.
- A single image shows a filename, a save button, and a "more" menu (copy image · delete file); tapping
  it opens the single-image viewer.
- n images show a count and a download-all button.
- When text and images are together, text sits above.
- Four tiles are shown, and the rest collapse into "+n".
- Tapping opens a full viewer with an attached thread column.

The planning notes set an attachment limit (10 images) and rejection copy (too many · duplicate ·
unsupported format).

**The server has no image upload API yet.** The message model has no image field, so this piece of work
is scoped to "UI only." The problem is that building the UI first lets fake data paths bleed into
components everywhere, and once the API exists every one of those paths has to be found and rewritten.

## Decision

### 1. Reads go through `useChatImages(messageId)` only

There is exactly one place that reads a message's images: `useChatImages`. Today this hook reads an
in-memory zustand store, `useChatImagesStore.byMessage`, and the only thing that fills that store is the
debug panel's Images tab. The Images tab attaches sample sets of 1 · 2 · 4 · 10 images to the four most
recent messages in the open channel.

Once the API exists, **this reader changes, not the components.** `MessageRow` and `MessageImages` only
know about `ChatImage { id, name, url, isUploading? }`. `url` is an object URL today, and will become an
uploaded file's URL later.

### 2. Sending with attachments is rejected outright

If there is an attachment, `Composer`'s submit shows a `chat.attach.unavailable` toast and stops. The
text and the tray stay in place. The send guard is owned by `Composer`, and `onSend` stays
`(content: string) => void`.

### 3. Attachment rules are judged by a single pure function

`validateAttachments(existingKeys, incoming)` judges the rules in one place.

- Only `png`, `jpeg`, `gif`, and `webp` are accepted. HEIC and the like are rejected rather than shown
  broken.
- The same file is only accepted once, keyed by `name:size:mtime`. Content hashing is not used because it
  would require reading the whole file on every drop.
- The tray holds at most 10 images; dropping 12 keeps only the first 10.
- One rejection notice per drop. Only the first reason encountered is shown — stacking three notices
  reads like an error.

The feed draws four tiles and turns the last tile into "+n" (`MAX_VISIBLE_TILES`).

### 4. Deletion writes directly to the store today — it becomes an optimistic mutation once the API exists

The "more" menu's "delete file" goes through a confirmation dialog and calls
`useChatImagesStore.removeImage`. This is the only write outside the reader. Once a server field exists,
this call must become a mutation following the repo rule (POST · PUT · DELETE write to the cache first
and roll back on failure).

### 5. Library markup is named explicitly in Tailwind's `content`

`createGlobPatternsForDependencies` reads the nx project graph, and returns `[]` under plain `vite` /
`vite build`, which run without that graph. So classes used only inside `libs/ui-kit` (`bg-popover`, the
dialog's `left-[50%]` centering) were never generated in the CSS. This is the cause of the image viewer
and "more" menu rendering transparent or off-screen. `tailwind.config.js` now names
`libs/{ui-kit,block-kit}` explicitly.

## Alternatives

- **Send text only when there's an attachment** — rejected. The user's message goes out with no
  indication the image was dropped.
- **Silently drop the image and send** — rejected, for the same reason.
- **Carry images as base64 in the message body (the ADR-0049 approach)** — rejected. A chat message
  propagates to every participant's cache and over the socket. Unlike a single piece of feedback, there
  is no path here that can carry that size.
- **Rely on `createGlobPatternsForDependencies` alone** — rejected. Both the dev server and the build run
  without the graph.

## Consequences

### What is gained

- All six Figma cases can be checked in the real layout: open the debug panel's Images tab and click
  "Attach samples."
- Once the API exists, the change is confined to one reader and one delete call.

### Trade-offs accepted

- Images live only in that window's memory. They disappear on refresh and are not visible to other
  participants.
- This PR also bundles a set of behavior changes from the same Figma alignment pass.
    - Sidebar rows changed to a single 34px line, and the previously visible last-message preview moved
      into a `title` tooltip.
    - The code-block button was dropped from the composer toolbar (the Figma toolbar is B · I · S ·
      `</>`).
    - Channel unread indicators are still a dot, not a count.

### When to reverse

The image UI does not render as long as `useChatImages` returns an empty array. Only the debug tab fills
the store, so production users already see nothing. To close the attachment entry points, two places need
touching. The "+" menu and paste close if the `onAddFiles` passed to `Composer` is removed. Drop closes if
`ChatPane`'s and `ThreadPanel`'s `useFileDrop` is removed.

## Next steps

- Once the upload API exists, have `useChatImages` read the message's server field, and turn the send
  rejection guard into the upload flow.
- Move deletion to an optimistic mutation (Decision 4).
