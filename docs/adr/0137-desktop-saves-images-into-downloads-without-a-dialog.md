# ADR-0137: desktop saves images into Downloads without a dialog, and nothing else

> Status: Accepted · Decided: 2026-09-29
> Scope: `apps/desktop/src/main/downloads.ts` · `apps/desktop/src/main/index.ts` (`will-download`
> handler) · `apps/desktop-web/src/app/features/chat/utils/imageActions.ts` ·
> `apps/desktop-web/docs/chat/images.md`

## Context

"Download all" on a message with several images did nothing useful in the desktop app. It opened one
native save dialog per image, all racing on the same window. Slack and Chrome, by default, save each
image straight into Downloads.

At first the renderer looked like the cause, since it fires one anchor download per image and browsers
guard against that. An Electron 33 probe with six anchor downloads showed that is not the case: all six
reach the session's `will-download` event, and Electron has no guard against multiple downloads. The
real cause was that the shell had no `will-download` handler. Without `item.setSavePath`, Electron
falls back to its default routine, and that routine shows a save dialog for every file.

So the question was when, if ever, the shell may save a file without asking the user where.

## Decision

### 1. Images from the app's own pages go straight into Downloads

A `session.defaultSession` `will-download` handler sets the save path itself when both of these hold:

- the page is trusted (`isTrustedUrl`: the app's origin or the custom-UI bundle);
- the file is an image the app sends (PNG, JPEG, GIF or WebP) and its extension matches its MIME type.

A single "Save" also skips the dialog, not only "Download all". Asking for a location on one save and
not on six would be two behaviours for one action.

### 2. Everything else keeps Electron's dialog

Any other file, a name whose extension does not match its type, or a download started by any other
page falls through to Electron's default.

The dialog was the only point where the user saw a file before it landed. A silent save for every
trusted-origin download would let script running in the app's page put an executable (`.command`,
`.app`) into Downloads without the user seeing it. Images cannot run, so they are the one case where
skipping the dialog costs nothing.

### 3. Names never overwrite, even in flight

On a name clash the file is numbered Chrome's way: `image (1).png`, `image (2).png`. `will-download`
asks for a path before any byte is written, so six images named `image.png` would all find the same
name free on disk and overwrite each other. A name taken by a download still in flight therefore counts
as taken until that download is done. Names are compared case-insensitively, because the default macOS
and Windows volumes ignore case. Only the last path segment of the suggested name is used, so a name
cannot leave the folder.

## Alternatives

- **Silent save for every download from trusted pages.** This was the first plan. A security pass
  rejected it for the executable case in Decision 2.
- **Ask for a location once per "Download all".** That needs a new renderer-to-shell bridge call and a
  second path for single saves. The user settled on no dialog.
- **Change the renderer (zip the images, or drop the 150ms gap).** The renderer was never the cause,
  and browsers still need the gap to get past their own guard against multiple downloads.
- **Timestamp or uuid suffixes instead of reservation.** These avoid in-flight state, but they lose the
  `name (1).ext` naming users know from browsers.

## Consequences

- There is no in-app sign that a save happened. On macOS the Downloads stack bounces
  (`app.dock.downloadFinished`), and other platforms show nothing.
- The path logic lives in an electron-free module so the main-process jest suite can load it. The
  handler wiring itself has no unit test; an Electron probe covered it.
- The origin check reads the top-level page, not the frame that started the download. That is correct
  only while the app embeds no other origin.
- Whether the packaged, signed app marks these files with `com.apple.quarantine` is unverified. The
  unpackaged probe showed only `com.apple.provenance`.
- It is a main-process change, so it reaches users only with a desktop shell release, not with the
  remote web bundle.

## When to reverse

- The app starts embedding another origin in a frame. The check must then read the initiating frame, or
  be dropped for a dialog.
- The app starts sending a file type that can run or open with side effects. That type does not join
  the list; it keeps the dialog.
- Users ask to choose a location. Add a per-save choice through the bridge instead of dropping the
  handler.
