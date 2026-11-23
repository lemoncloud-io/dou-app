# browser file handling — downloads, the iOS check and the PDF loader

The browser-tab paths for saving, sharing and previewing files are described in
[image-export.md § In a browser tab](./image-export.md#in-a-browser-tab) and
[image-send.md § The document viewer](./image-send.md#the-document-viewer-browser). This page holds
the details of the helpers underneath them: `lib/fileDownload.ts`, `lib/browserSave.ts`,
`utils/attachSources.ts` and `lib/pdf.ts`.

## Telling iOS and iPadOS WebKit apart

`isAppleTouchWebKit` is true for an iPhone, iPad or iPod user agent, and for a `Macintosh` user agent
with more than one touch point. The second case is an iPad: it asks for the desktop site by default
and says `Macintosh`, so a touch screen is what gives it away. The check covers Safari, a home-screen
web app, an in-app browser and the app's own WebView, since all of them are WebKit. It decides three
things: the album input offers photos only, the files input uses the iOS `accept` list, and a save
goes to the share sheet instead of a download.

## Fetching a file into memory

- **Why a fetch at all.** An anchor's `download` attribute names a file only for a same-origin
  address, and the signed address belongs to the storage bucket, so pointing an anchor at it would
  open the file or save it under the object key. The bytes are fetched into a `Blob` first and saved
  from a local address, which the attribute does apply to.
- **Progress is reported once per whole percent.** Each report re-renders the caller, and a long
  video arrives in thousands of chunks. Progress is only read when the caller asked for it, the
  response has a `content-length`, and its body can be read as a stream. Otherwise the body is read
  whole, with no progress, which also covers an old engine or a test double.
- **The blob keeps the response's content type**, so a stream-assembled `Blob` is the same type a
  whole-body read would give.
- **How a result is decided.** A 403 is `expired` (the signed address outlived its time), any other
  non-2xx is `failed`, and a failure while fetching or reading the body is `cancelled` when the
  caller's signal was aborted and `failed` otherwise.
- **The download link outlives the click.** The anchor is clicked synchronously, but some browsers
  still read its `blob:` address a moment later, so the object URL is revoked a minute after the
  click rather than at once.

## The PDF loader — `lib/pdf.ts`

- **The same loader as the desktop's viewer**, kept in each app rather than in a library because it
  is tied to the app's own Vite build: the worker arrives as a `?url` import, and the data files
  (character maps, standard fonts, colour profiles, WebAssembly decoders) are served by the
  `pdfjs-assets` plugin in that app's Vite config. Their address is built from `document.baseURI`.
- **The legacy build, on purpose.** The modern pdf.js build calls `Map.prototype.getOrInsertComputed`,
  which Chromium did not ship when this was written (not in 142, nor in the shell's 130). The legacy
  build polyfills it. Check this before moving to the modern build.
- **What the data files are for.** The character maps and standard fonts let a PDF that names a font
  without embedding it (common in Korean files) still draw its text. The WebAssembly files decode
  JPEG 2000 and JBIG2 images.
- **Canvas only.** No text or annotation layer is built, so a file someone else sent has no live
  links or forms, and XFA forms are switched off for the same reason.
- **Loaded on first use.** The feed never pays for pdf.js. `preloadPdf` starts the load so it arrives
  while the file is still downloading. A failed chunk load is not remembered: the next open tries
  again.
- **One drawing per canvas at a time.** A caller cancels the previous drawing and lets it settle
  before starting another on the same canvas. A cancelled drawing makes its `done` promise reject.
- **Pixel cap.** A page is drawn at the device pixel ratio unless that would exceed 16 million
  pixels; then the ratio is lowered. An A4 page 880 px wide at a ratio of 2 is about 4.4 million, so
  the cap only stops outliers.
- **Nothing is kept per page.** After each drawing the page's parsed content is released, so a page
  that was scrolled past is parsed and drawn again if it comes back. The first page's height over
  width is given to the viewer, which holds a page of that shape until its own is known.
- **A file that will not open frees its worker.** pdf.js keeps the worker it started for a document
  it could not open, a damaged or locked file, until told to let it go; the loader destroys the
  task before reporting the failure. `destroy` on an opened document frees the document and its
  worker.
