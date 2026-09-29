# ADR-0129: Desktop's image surface departs from Figma where the drawing cost a click or hid state

> Status: Accepted · Decided: 2026-09-29 · Implemented: PR #508 (`fix/desktop-chat-critique`)
> · Scope: `apps/desktop-web/src/app/features/chat/components/images/**` ·
> `apps/desktop-web/src/app/features/chat/hooks/useImageAttachments.ts` · `DESIGN.md`
> · Builds on [ADR-0135](./0135-desktop-sends-images-through-the-runtime-image-send.md) (the send path);
> this one is only about what the screens show.

## Context

The desktop image screens were built to the Figma frames for the composer tray, the notices, the
feed tiles and the full-image viewer. A design critique and an accessibility audit walked them as
tasks ("send photos, then view, save and copy them"), and several of the drawn choices were what made
the tasks slow or silent:

- The "+" opened a menu with one entry ("Upload from your computer"), so attaching took two clicks.
- An image's "More" menu held Copy and Delete. For every image someone else sent there is no Delete,
  so it held Copy alone. The menu also portalled out of the tile and dropped the save bar from under
  the pointer when it closed.
- A refused file raised a centred notice dialog, one reason per drop. A drop of nine into a tray of
  two said "up to 10" and never that one of the nine was left out, and a duplicate stopped everything
  until the dialog was dismissed.
- The viewer's app-behind was frosted rather than dimmed, and its save, copy and arrow controls waited
  for a hover, so the only way to find them was to wave the pointer.

## Decision

1. **"+" opens the file picker directly.** No menu.
2. **Save, copy and delete are icon buttons side by side** on a tile and in the viewer. There is no
   More menu on images.
3. **Refusals are a toast that counts every reason** ("Up to 10 images per message, so 1 was not
   added. 1 file wasn't added. Only PNG, JPEG, GIF and WebP images can be attached."), not a dialog.
   An unsupported file uses the destructive tone; the limit and a duplicate are information.
4. **The viewer dims with a plain scrim and keeps its controls on screen.** The picture fills the stage
   up to twice its own size.
5. **Hover-revealed controls elsewhere follow one rule** (`hoverReveal`): hidden only on a device that
   can hover, and shown whenever focus is inside their group.

## Consequences

- The Figma notice frames ("#image upload exceeded / duplicate / upload error") and the image "More"
  menu frame no longer have a counterpart in the client. A designer reading the file against the app
  should read this record first.
- The tray, tiles and viewer each lose a portalled layer, which removes the class of bug where closing
  a portalled menu hid the bar that opened it.
- A toast can be missed where a dialog could not. The tray's live region also announces what joined
  it, so a screen reader hears the outcome either way.

## Rejected

- **Keep the menu, add Copy to the tile bar.** Two ways to copy, and the menu would still exist for
  one item on most images.
- **Keep the dialog, list every reason in it.** Still blocks the drop that produced it, for what is
  usually a limit, not a mistake.
