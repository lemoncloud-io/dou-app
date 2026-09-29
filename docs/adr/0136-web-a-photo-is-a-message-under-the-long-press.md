# ADR-0136: on `apps/web`, a photo is a message under the long press

> Status: Accepted · Decided: 2026-09-29
> Scope: `apps/web/src/app/features/channels/**` (`ChannelMessageRow` · `MessageActionSheet` ·
> `ChannelRoomPage` · `ThreadPage` · `utils/messageActions.ts`)
> Related: [ADR-0093](./0093-web-emoji-reaction-and-thread.md) (the long-press sheet, reactions and
> threads this extends to photos) · [ADR-0103](./0103-web-message-edit-delete-and-non-optimistic-delete.md)
> (§5, the "existing rows never move" promise this narrows) ·
> [ADR-0123](./0123-picking-a-photo-sends-it-and-the-shell-decides-how-it-is-picked.md) (photo
> messages on this shell)

## Context

A photo message on `apps/web` could not be reacted to or replied to. The long-press target was the
text bubble alone, and both pages opened the action sheet only for a message with `content`. A photo
sent with no text — the common case — has none, so the gesture reached nothing at all. Yet it is a
message like any other: it has a `chatNo`, it takes a reaction row and a `parentId` the same way,
and the server has no notion that it is different.

## Decision

### 1. The image tiles are a long-press target, wherever they sit

The tiles take the same press handlers as the bubble, both when they replace the bubble (no text)
and when they sit under it. A tap still opens the viewer; the `click` that ends a hold is swallowed
so the viewer does not open under the sheet. A right-click on a tile opens the sheet too, which
means a desktop browser's own image menu ("Save image as…") is no longer reachable there.

The viewer is portalled to the body but remains the tiles' child in React, and React bubbles events
along that tree. The gesture therefore ignores any event whose DOM target lies outside its own
element — otherwise a hold, or a pinch, inside the open viewer would open the sheet over the photo.

### 2. One rule decides whether the sheet opens, and what it holds

`canOpenMessageActions` (`utils/messageActions.ts`) is asked by the room and the thread alike. Text
always opens it, landed or not, because Copy applies to either. An image-only message opens it only
once persisted: every action it can take — a reaction, a thread, a delete — needs the `chatNo`, and
a row still on its way would open an empty panel.

The sheet leaves **Copy and Edit** out when the message has no text (`hasText`). Both act on text;
Copy would do nothing and Edit would open an empty editor.

### 3. The fixed rows promise narrows to a fixed order

ADR-0103 §5 kept "the existing two actions keep their positions". Without Copy, my own photo's sheet
reads Thread, then Delete, so Delete takes the slot Copy holds on a text message. What stays fixed is
the **order** — thread, copy, edit, delete — with rows present or absent according to what the
message carries. The confirmation dialog in front of the server delete is what makes a thumb landing
on it recoverable.

## Alternatives

- **Keep a disabled Copy row on a photo** so the positions hold exactly. Rejected: a greyed "copy
  message" on a picture reads as a broken feature, and the slot it protects is behind a
  confirmation anyway.
- **A separate photo menu** (save, share, react) on the tile. Rejected for now: it is a second
  message-action surface on a phone, the thing ADR-0103 §5 already chose against, and save/share
  are not built.
- **Leave the right-click alone on desktop browsers** by skipping `contextmenu` on tiles. Rejected:
  the web shell's right-click already means "open the sheet" on a bubble, and two meanings for the
  same click depending on what was under the pointer is worse than losing the browser menu on a
  surface whose real home is the mobile WebView.

## Consequences

- A photo can root a thread, so the thread page draws the root's images as its subject.
- The sheet's row set varies with the message, not only with authorship; any new action goes in
  the fixed order, never assumed to sit at a fixed index.
- In a desktop browser a photo can no longer be saved from its tile; saving belongs to the viewer
  and is not built yet.
- `apps/desktop-web` is untouched — it acts on messages through its own hover toolbar, not this
  sheet.

## When to reverse

If save and share land in the viewer and the long-press sheet grows photo-specific actions, revisit
whether a photo should get its own sheet rather than a text sheet with rows removed.
