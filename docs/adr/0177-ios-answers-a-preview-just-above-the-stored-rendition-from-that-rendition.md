# ADR-0177: iOS answers a preview just above the stored rendition from that rendition

> Status: Accepted · Decided: 2026-10-07 · Implemented: `fix/ios-photo-preview-stored-size`
> · Scope: `apps/mobile/ios/Bridges/PhotoLibrary` (`PhotoLibraryCore.previewSide`, `squareThumbnail`)
> · Amends [ADR-0174](./0174-the-photo-grid-is-virtual-pages-by-offset-and-asks-for-previews-at-its-tile-size.md):
> its "previews at the tile size" rule, on iOS, for sizes from 353 to 440 px
> · The module doc is [apps/mobile native/photo-library.md](../../apps/mobile/docs/native/photo-library.md)

## Context

ADR-0174 made the grid ask for previews at its tile size. A three-column tile is 384 px on a 390pt
phone at 3× and 432 px on a 440pt one. Its measurements were taken on a simulator and an emulator
with small generated images, where that size was fast.

On a real iPhone 14 Pro (iOS 26.7) with a library of 21,550 photos, a page of 60 took 1.6–2.8 s while
the grid was in use. Scrolling or jumping into a part of the grid that had not loaded left its tiles
loading for that long. A bench in the app asked for pages directly, at different sizes:

- **By page, previews made in parallel:**
    - Up to a 352 px square, a page took 0.13–0.5 s.
    - At 368 and 400 px it took 1.1–2.2 s.
- **By preview, made one at a time:**
    - Up to 352 px, about 5 ms.
    - From 368 px up, about 35 ms for nearly every photo, whatever its shape.
- **What made no difference:**
    - `resizeMode .exact` and `.fast` timed the same.
    - A page asked for a second time took as long as the first.
- **Parallel previews helped only a little.** At 400 px, making them four at a time took a page from
  2.1–2.5 s to 1.3–1.9 s.

The same bench on iOS 26.3 and iOS 18.3 simulators, with 300 generated 12 MP JPEGs, gave the same
boundary: 4–5 ms per preview at 352 px and 26–31 ms from 368 px.

Photos keeps a small rendition of every photo on the device. Up to a 352 px square, the preview is cut
from it. Past that, PhotoKit decodes the original, a 12 MP HEIC or JPEG, for every tile.

Asking PhotoKit only for what is already stored (`deliveryMode .fastFormat`) was measured too. It is
instant, but it answers about 40 px, so it cannot replace the stored rendition the 352 px request
reaches.

## Decision

**When a preview is asked for above 352 px and at most 1.25× that (440 px), iOS makes it at 352 px.**
The square is cut from the stored rendition and sent at that side, and the tile draws it up to 1.25×
larger. Sizes at or below 352 px, and sizes past 440 px, are made exactly as before.

- **Three, four and five columns on phones from 375pt to 440pt wide ask for 440 px or less.** They all
  get the stored rendition. On the iPhone 14 Pro, a three-column page went from 1.3–2.2 s to
  0.16–0.57 s in the bench. While the grid was in use it took 0.19–0.54 s.
- **Two columns on a 3× phone ask for about 600 px, past the reach.** They still get the original
  decoded at full sharpness, at the old speed. On a 2× phone, two columns ask for 384 px and get the
  stored rendition.
- **The rule lives in the iOS shell,** because the 352 px rendition is a fact about Photos. The web
  keeps asking for its tile size.
- **Android is unchanged.** On an API 35 emulator, `loadThumbnail` took the same time from 288 to
  592 px: a page took about 1.4 s the first time and 0.25–0.54 s after. For a 12 MP photo it answered
  324 px at most.

## Consequences

- **A three-column tile on iOS draws its preview 9–23% larger than its pixels.** A 384 px tile shows
  a 352 px square, and a 432 px tile on a 440pt phone does too. The reach stops at 1.25× so the
  enlargement stays this small. A two-column tile on a 3× phone would draw the same square 1.7×
  larger, and that is the softness ADR-0174 set out to remove.
- **352 px was measured on one real phone and on simulators of iOS 18 and 26.** If Photos keeps a
  different rendition elsewhere, the result changes:
    - If it keeps a larger one, a request inside the reach is still fast but a little softer than it
      needed to be.
    - If it keeps a smaller one, the request is as slow as before and a little softer.

    The constant is `PhotoLibraryCore.storedPreviewSide`.

- **Video poster frames take the same path**, so they are made at 352 px too. The bench timed
  libraries of photos.
- **The web's sharper-preview refetch is unaffected.** It compares the sizes it asked for, not the
  pixels it got, so a 352 px answer to a 400 px request is not fetched again. The contract now says
  so: a shell may answer a little under `thumbSize`.
- **An app update is needed.** Installed apps keep asking PhotoKit for the full size.
