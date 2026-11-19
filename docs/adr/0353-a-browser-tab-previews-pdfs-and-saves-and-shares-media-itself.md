# ADR-0353: A browser tab previews PDFs and saves and shares media itself

> Status: Accepted · Decided: 2026-11-19
> Scope: `apps/web` (`src/app/features/channels/{components/DocumentPreview.tsx,components/MessageImages.tsx,components/SaveShareButtons.tsx,pages/RoomFilesPage.tsx,hooks/useFileDownloads.tsx,hooks/useImageExports.tsx,lib/pdf.ts,lib/fileDownload.ts,lib/browserShare.ts,lib/browserMediaExport.ts}`,
> `vite.config.mts`) · `libs/web-ui-kit/src/composites/overlay/DocumentViewer.tsx`
> · The module docs are [image-export.md](../../apps/web/docs/feature/channels/image-export.md) and
> [image-send.md § Document cards](../../apps/web/docs/feature/channels/image-send.md#document-cards)
> Amends: [ADR-0155](./0155-the-viewer-offers-save-and-share-when-the-handshake-lists-both.md), whose
> "not done here" left a browser tab without save and share. Inside the app its decisions stand.

## Context

In a browser tab a document card had one behaviour for both of its targets: the card body and the
download button each fetched the file and saved it (`lib/fileDownload.ts`). On a phone browser a
saved PDF is then shown in place of the page — the room is gone, the browser's back does not lead to
it reliably, and the PDF screen has no way to keep the file. Users reported exactly that: no way back,
no download.

The photo and video viewer had the opposite gap. ADR-0155 gave it save and share only when the app's
handshake lists `SaveToPhotoLibrary` and `ShareFile`, and left a browser tab with neither button, on
the grounds that the page can hold a photo's bytes only if the storage bucket sends CORS headers. The
browser's document download had already taken that dependency for documents, and the dev bucket
answers a CORS fetch.

Inside the app nothing is wrong: the shell opens a document with the OS (QuickLook, the Android
viewer), and saves and shares photos itself.

## Decision

1. **In a browser, a sent PDF opens in the page.** Pressing the card body (in a room, and in the room's
   file list) opens `DocumentViewer`, drawn with pdf.js — the same loader and `pdfjs-assets` plugin
   `apps/desktop-web` uses — instead of downloading. The card's button still downloads. Other formats,
   and everything inside the app, keep their behaviour.
2. **The document viewer is the photo viewer's frame**: black, the page most in view as "3 / 12" along
   the top, close at the top right, share at the left and save at the right of a bar along the bottom.
   The pages run down one scrolling column, because a document's pages follow on.
3. **Save and share hand over the bytes the viewer fetched to draw**, so neither waits on the network.
   Before they arrive, save downloads as the card's button does. A PDF that will not open still offers
   both.
4. **The photo viewer saves and shares in a browser too.** The page fetches the original with
   `cache: 'no-store'` (a copy an `<img>` left in the HTTP cache carries no CORS headers), saves it as a
   browser download, and shares it with the Web Share API as a file alone. "Save all" stays an app
   feature.
5. **Share is offered only where the browser shares files** (`navigator.canShare` with a file). Most
   desktop browsers say no, and the bar then shows save alone, at its right end.
6. **A share the browser refuses for a stale tap keeps the bytes.** A share must start within moments
   of the press; a long fetch can outlast that. The page keeps what it fetched and asks for another
   tap, which then shares at once.
7. **Closing is the viewer's own**: the close button and Esc. The browser's back leaves the room, as it
   does from the photo viewer; the viewer adds no history entry.

## Alternatives

- **Open the PDF in a new tab** (`window.open` on the blob). A phone browser's PDF tab still has no
  way back into an installed web app, and a pop-up after an asynchronous fetch is blocked.
- **Frame the browser's own PDF viewer** (`<iframe>`/`<embed>`). iOS Safari draws only the first page
  of a framed PDF and Android Chrome has no inline PDF viewer, so neither phone would get a reader.
- **Give the viewer a history entry so back closes it.** Back would then behave better than in the
  photo viewer, but the app's stack tracking counts history entries to decide what back does, and an
  entry it did not push is a new kind of state to keep right. The two viewers stay alike; it can be
  done for both later.
- **Share the signed address instead of the file.** It expires within the hour and names the bucket;
  the receiver gets a dead link.
- **Save all in a browser.** Browsers ask before a page starts several downloads, so a run reads as a
  pile of prompts; the room's file list still saves a selection one by one.
- **Move the pdf.js loader into a library shared with desktop-web.** It is tied to each app's Vite
  build — the worker arrives as a `?url` import and the data files come from that app's plugin — so
  each app keeps its copy.

## Consequences

- **A phone browser reads a PDF in the room**, and can come back from it.
- **Photo and video save and share in a browser depend on the bucket's CORS.** Where a bucket sends
  none, the fetch fails and a toast says the item could not be saved or shared; nothing else breaks.
- **The whole file sits in memory while it is saved or shared.** For a document the 50MB limit keeps
  that affordable; a long video can be hundreds of megabytes, which a phone browser may not hold.
- **pdf.js loads on first use** — a few hundred kilobytes of script and its worker, plus the CMaps and
  fonts a file names — and only in a browser that opens a PDF.
- **In the Vite dev server the pdf.js worker fails to start** (the dev server adds its client to the
  worker module) and pdf.js draws on the main thread instead; a build ships the worker untouched.
