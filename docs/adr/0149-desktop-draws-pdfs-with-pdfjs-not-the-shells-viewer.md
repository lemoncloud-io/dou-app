# ADR-0149: Desktop draws PDFs with pdf.js, not the shell's built-in viewer

> Status: Accepted · Decided: 2026-09-30
> · Scope: `apps/desktop-web/src/app/features/chat/` (`FileViewer`, `PdfPages`, `utils/pdf.ts`, `utils/filePreview.ts`)
> · The module doc is [apps/desktop-web chat/images.md](../../apps/desktop-web/docs/chat/images.md) § The document viewer

## Context

Desktop can send and receive documents (ADR-0148), but a received one could only be saved and opened
in another app. Reading a PDF or a text file in place, the way Slack shows one with a page rail
beside it, was asked for.

Chromium has a PDF viewer of its own, but the desktop shell is Electron 33, whose
`webPreferences.plugins` defaults to `false`, and the shell does not turn it on. The web layer is
loaded remotely and updates without a shell release; the shell does not.

## Decision

- PDF and TXT open in an in-app viewer. DOCX, XLSX, PPTX, HWP and HWPX stay save cards.
- PDFs are drawn by `pdfjs-dist` in the web layer, loaded on first use, legacy build, canvas only.
- Text is shown as its first 1 MB, decoded as UTF-8 and then EUC-KR.

## Consequences

- It works in every shell already installed, because nothing in the shell changes.
- The app carries pdf.js: about 0.5 MB for the library and 1.3 MB for its worker, both fetched only
  when a PDF is first opened.
- The legacy build is chosen because Chromium does not ship `Map.prototype.getOrInsertComputed`
  yet (not in 142, nor in the shell's 130), which the modern build calls. Moving to the modern build
  waits for a shell whose Chromium has it.
- There is no text selection, search, zoom or printing; the save is the way out to a full reader.
- pdf.js is a parser of files from other people. Keeping it current matters: CVE-2024-4367 was a
  script-execution bug in its font handling. Only page canvases are drawn, with no annotation layer
  and XFA off. The `isEvalSupported` switch that guarded that font path is gone in pdf.js 6, along
  with the path itself, so it is not set.
- pdf.js's data files (CMaps, standard fonts, ICC profiles, image-decoder wasm, about 4 MB) are
  emitted with the build and fetched only when a PDF names them. Without them a Korean PDF that does
  not embed its fonts draws without its text.

## Alternatives

- **Chromium's built-in viewer in an `<iframe>`.** No new dependency and a richer reader, but it needs
  `plugins: true` in the shell: a shell release, with every shell already installed showing a blank
  frame. Its toolbar and rail cannot be styled or driven from the page either.
- **An online viewer (Office Online, Google Docs) for office and Hancom files.** It would send the
  file's signed address to a third party. Not taken.
- **Reading the whole text file.** A 50 MB `<pre>` stalls the window; the save gives the whole file.
