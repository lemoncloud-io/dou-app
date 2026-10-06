# ADR-0174: The photo grid is virtual, pages by offset, and asks for previews at its tile size

> Status: Accepted · Decided: 2026-10-06 · Implemented: `feat/photo-grid-quality-and-scroll`
> · Scope: `libs/app-messages` (`ListPhotos.thumbSize`/`offset`, `OnListPhotos.offset`/`total`,
> `ListPhotoAlbums.thumbSize`) · the iOS and Android `PhotoLibrary` modules and their cores ·
> `apps/mobile/src/app/webview/hooks/photoLibraryHandlers.ts` · `apps/web/src/app/bridge/photoLibrary.ts` ·
> `apps/web/src/app/features/channels/` (`usePhotoPicker`, `usePhotoGridColumns`, `ChatImageAttach`) ·
> `libs/web-ui-kit` (`PhotoGridSheet`, `GridScrubber`, `photoGridLayout`, `BottomSheet.scrollRef`) ·
> `libs/config` `ui.photoGridColumns`
> · Amends [ADR-0150](./0150-the-shell-reads-the-photo-library-and-prepares-what-it-hands-over.md): its
> ~256 px previews and its "a preview that cannot be made is skipped" rule
> · The module docs are [apps/mobile native/photo-library.md](../../apps/mobile/docs/native/photo-library.md)
> and [apps/web channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md)

## Context

The in-app photo grid (ADR-0123, ADR-0150) had four problems, all in the same screen.

- **Previews were soft.** Both shells made them about 256 px on the long edge, aspect-fit, JPEG 0.7. A
  three-column tile on a 3× phone is about 390 device pixels square and drawn `object-cover`. A 4:3
  photo's short edge of 192 px was stretched about twice. iOS asked PhotoKit with `resizeMode .fast`,
  which may hand back anything at or above the target.
- **The grid was not virtual.** Every page scrolled into view stayed as `<img>` elements, decoded
  bitmaps and base64 strings in React state. Sharper previews make each of those bigger: about 0.64
  MB of bitmap (400 × 400 × 4 bytes) per tile at 400 px, and a longer string. A WebView content
  process that grows past what the OS allows is killed, and the app's reload loses whatever the
  person was doing.
- **The header scrolled away.** The whole sheet body was one scroll container.
- **A long album had no fast way through it.** Pages came by cursor, so reaching the 5,000th photo
  meant paging through the 4,999 before it.

The web ships before the app, so an installed app has to keep working with a web that asks for
things it does not know.

## Decision

1. **The web asks for previews at the size it draws them (`thumbSize`).** The size is the tile's CSS
   side × `devicePixelRatio`, rounded up to 16. The shell clamps it to 64–720 and answers the photo's
   centre square at that side, JPEG 0.8. It asks the library for the photo fitted in a square box sized
   so the short edge comes out at `thumbSize` (long ÷ short capped at 3), crops the middle and scales
   down, never up. iOS uses `resizeMode .exact`. When the sharp rendition is not on the device it still
   falls back to the fast one, whose square can come out smaller and is drawn larger by the tile: a soft
   tile beats a missing one. Without the field the
   shell answers exactly what it did before.
2. **Pages can be asked for by position (`offset`).** The reply echoes the `offset` it used and the
   list's `total`. Every position answers its own item, even one whose preview could not be made (it
   comes with an empty `thumbBase64`). The cursor path is unchanged and still skips such an item.
3. **The web trusts an offset only when it is echoed.** An app from before the field ignores it and
   answers the first page with neither field. The grid's first request is always offset 0, so that
   answer is still correct. `bridge/photoLibrary.ts` learns from the missing echo once per page load, and
   the grid falls back to cursor paging for the session. The handshake's `supportedWebMessages` is not
   used, for the reason ADR-0123 gives for `NOT_FOUND`: it arrives late and is built from the compiled
   message map rather than from what a handler reads.
4. **The grid is virtual.** It is laid out at full height from `total` and renders the rows on screen
   plus four either side. The host gets told which photo indices those rows show. It asks for the
   60-photo pages that cover them one request at a time, nearest the middle first. Positions with no
   data yet draw as empty tiles. The hook holds ids per position apart from previews by id, so previews
   can be released later without losing the layout. They are not released yet. A `total` that changes
   between pages means the library changed: the layout is remade and the pages on screen are asked for
   again.
5. **The title row and the picked strip are fixed.** The limited-access notice and the grid scroll in
   a container of their own. `BottomSheet` gained `scrollRef` so swipe-to-dismiss reads that
   container's position instead of its body's, which never scrolls any more. Other sheets pass nothing
   and behave as before.
6. **A fast-scroll handle, with no date label.** It shows for content longer than three screens,
   appears while scrolling and fades 1.5 s after. Dragging it scrolls in proportion. Items carry no
   date, and a position not yet loaded would have none to show.
7. **A pinch steps the columns between 2 and 5, default 3.** It takes one step per 1.3× of spread. The
   change is immediate, with no animation, and the scroll is set so the photo under the fingers stays
   under them. The count is kept in `ui.photoGridColumns` (local). The page's viewport already
   disallows zoom. The grid adds `touch-action: pan-y`, cancels the two-finger `touchmove` and cancels
   WebKit's `gesture*` events, so neither WebView scales the page. When the tiles grow past 1.2× the
   size their previews were asked at, the pages on screen are asked for again at the new size. There is
   no button for the columns.

## Consequences

- **An app update is needed for the sharper previews and the fast jump.** An installed app keeps its
  ~256 px previews and cursor paging. The grid there is still virtual and the header still fixed. The
  handle there only spans what has loaded.
- **A preview page is heavier.** A 400 px square holds about 3.3 times the pixels of a 256 × 192
  preview, at a higher quality, and its base64 string grows with it. ADR-0123 counted a page of 60
  as a few hundred KB over the bridge; it is now several MB. Virtualization bounds the decoded
  bitmaps to what is on screen. It does not bound the strings held in state: an album scrolled end
  to end keeps every preview it loaded. Releasing them is left for when a measurement says it is
  needed. The id/preview split exists so that can be done without touching the layout.
- **Offsets give up the cursor's guarantee.** A photo taken between two pages shifts every index after
  it. `total` catches an addition or a deletion. An addition and a deletion between the same two pages
  leave the count equal and can show one photo twice or miss one until the grid is reopened. Picks are
  by id, so a send is never affected.
- **A preview that cannot be made now shows as an empty tile on an offset page**, where ADR-0150 left
  it out. Leaving it out would shift every later position by one. The photo is still pickable, since
  reading it does not use the preview.
- **The previews are square.** Every place the web draws them fills a square, so the rest of the photo
  was bytes cropped away on arrival. A future layout that shows whole photos would need the field
  extended, for example to ask for a fit instead of a fill.
- **No accessible equivalent of the pinch.** Three columns, which is what everyone starts with, is the
  whole picker. The pinch only changes how many tiles fit on screen. The handle is hidden from
  assistive tech because the grid scrolls by every other means.
- ADR-0123's "previews travel as base64; there is no cheaper form" still holds. A custom URL scheme
  (`WKURLSchemeHandler` / `shouldInterceptRequest`) would avoid the strings, but it is a separate
  decision, worth taking only once a measurement asks for it.

## Alternatives

- **Fill a far position by paging up to it in order.** This needs no protocol change. A jump to the end
  of a 10,000-photo album would then ask for about 170 pages before showing anything. Rejected for
  long albums; it survives as the fallback for apps without offsets.
- **Offsets without an echo, trusting a version number or `supportedWebMessages`.** An installed app
  that ignores the field answers the first page, and its photos would be drawn at the wrong positions.
  Only the answer itself can say whether the field was read.
- **Previews fitted rather than cropped (short side at `thumbSize`, long side free).** A panorama's
  long side made it many times larger, and no screen draws the parts a square drops.
- **Ask for the largest tile's size from the start (two columns, about 600 px).** It is simpler and
  needs no refetch. It also nearly doubles every preview for a layout most people never pinch to.
- **A virtualization library.** Tiles of one fixed size make the row arithmetic a few lines, which are
  tested on their own (`photoGridLayout`). A library would add a dependency and still need the anchor
  and handle logic written around it.
- **Animate the column change.** It would mean transform transitions on hundreds of absolutely placed
  tiles that mount and unmount as they scroll. An instant change with the anchor held reads as
  stable.
- **Show the date on the handle.** That needs a date per item, and something to show while a position
  has not loaded. Neither exists, and the jump works without them.
