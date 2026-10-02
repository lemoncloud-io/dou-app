# ADR-0155: The viewer offers save and share when the handshake lists both

> Status: Accepted · Decided: 2026-10-01
> · Amended by: [ADR-0160](./0160-the-mobile-snackbar-sits-at-the-bottom-and-screens-lift-it-over-their-bars.md)
> — the snackbar moved to the bottom; the buttons stay there and the viewer lifts it above them
> · Scope: `apps/web/src/app/bridge/{shellCapabilities,shellDownload,appBridge}.ts` ·
> `apps/web/src/app/runtime/transfer/` · `apps/web/src/app/runtime/upload/transferSync.ts` ·
> `apps/web/src/app/features/channels/{lib/imageExport.ts,hooks/useImageExports.tsx,components/SaveShareButtons.tsx,components/MessageImages.tsx}` ·
> `libs/web-ui-kit/src/composites/overlay/ImageViewer.tsx`
> · The module doc is [apps/web image-export.md](../../apps/web/docs/feature/channels/image-export.md)
> · Related: [ADR-0152 (native downloads and media export)](./0152-a-download-lands-in-a-folder-the-shell-owns-and-only-its-files-leave-the-app.md)
> (the shell side this calls)
> · [ADR-0136 (a photo is a message under the long press)](./0136-web-a-photo-is-a-message-under-the-long-press.md)
> (still holds: the long-press sheet gains no photo actions)

## Context

ADR-0152 gave the shell a download and two ways to pass the file on: `SaveToPhotoLibrary` and
`ShareFile`. The web is deployed ahead of the app, so for a while most installed apps will not have
them. The page needs a way to tell, and what it decides shapes what an older app shows.

The repo already has two ways to tell:

- **Ask, and remember the first `NOT_FOUND`.** The photo picker does this
  ([ADR-0123](./0123-picking-a-photo-sends-it-and-the-shell-decides-how-it-is-picked.md)), and so do
  the upload sender and haptics. ADR-0123 rejected the handshake for two reasons. It arrives
  asynchronously and would race the first use. And it is built from the app's compiled message map,
  not from the handlers actually registered, so it can claim support that is not there.
- **Read the handshake's `supportedWebMessages`.** The performance-trace backend does this
  ([ADR-0120](./0120-performance-traces-move-to-firebase-performance.md)). There a wrong answer costs
  only a fallback, and nobody sees it.

Neither settles it by itself. The picker can ask because asking is invisible: an attach menu with no
recent photos looks like any other attach menu. A save button cannot be asked about. It is either
there or not, and on an older app it would be pressed before anything had been learned, then fail.

The rest of the flow had open questions too. A share on iOS answers only when the sheet closes. The
first save waits on the OS permission prompt. An iOS download whose connection drops stays `running`
for as long as days. And the signed address in an open room expires.

## Decision

**The buttons appear only when the handshake lists both messages, start hidden, and are withdrawn
for the session at the first `NOT_FOUND`.**

- **Hidden until the handshake says so.** `shellCapabilities` reads the reply once, in `main.tsx`.
  Before it arrives, and in a browser where none arrives, the answer is false. That answers the race
  ADR-0123 named: the viewer opens long after boot, and if it opens first it simply shows nothing.
- **Both, or neither.** The viewer offers both, and a button that fails on press is worse than no
  button.
- **The gap between the message map and the handlers is closed on the app side.** The app's router
  test fails when either message has no registered handler. If a press still meets `NOT_FOUND`, the
  buttons are withdrawn until reload and a toast asks for an app update.
- **The shell downloads; the page never hands it bytes.** The page may not hold them: without CORS
  from the bucket it draws the signed address straight into `<img>`. So the export does not read the
  image cache.
- **The page owns the recoveries, because the shell judges no HTTP status.** A 403 reads the message
  again and downloads its fresh address once. A `SOURCE` failure from the save or share (the OS
  cleared the cache) downloads once more.
- **Save and share wait ten minutes. A download with no byte for thirty seconds is cancelled** and
  reported as a network failure. Ten minutes covers the permission prompt and an open share sheet.
  Thirty seconds is what makes the iOS behaviour finite.
- **The flow acknowledges only the downloads it started — a file after use, a failed download at
  once.** The catch-up also acknowledges ended downloads nobody waits for, left by a page before a
  reload. An acknowledgement drops the shell's record, never the file. The upload catch-up now reads
  only uploads from the shared list: it acknowledges everything it reads, and taking a download's
  record would make the download catch-up fail a save that had succeeded.
- **A stall is checked against the shell before it cancels.** iOS keeps counting the page's timers
  while the app is suspended, so a save finished in the background meets an expired window on
  return. The page asks the shell for that download first and cancels only one that is still
  `running` with no new byte.
- **The buttons sit in a bar along the viewer's bottom edge; the kit gets a slot, not chat
  knowledge.** `renderFooter(index)` draws whatever the host gives it, share at the left end and save
  at the right, and `ImageViewerActionButton` keeps the look. Not the top bar: a toast slides in at
  the top for five seconds, and a toast is pressable — it covered the buttons its own press had
  raised. The viewer also ignores presses on anything drawn over it from outside its dialog, so a
  toast's **Settings** reaches its button instead of closing the viewer on the way.
- **Save asks "this photo or all" on a message of several.** A sheet over the viewer offers save this
  photo or save all (N); one photo saves at once. Save all runs the flow photo by photo, never side by
  side, so the first permission prompt appears once and the shell is not handed a burst; a refused
  permission or `NOT_FOUND` stops it, any other failure skips that photo, and one toast reports the
  count, or the reason it stopped. Share stays a single photo.

## Alternatives

- **Learn from the first `NOT_FOUND`, as the picker does.** Rejected: the button would show on every
  older app and fail on its first press, every session. The picker's question has an invisible
  answer; this one has a visible one.
- **Show the buttons, and probe on viewer open.** Rejected: there is no harmless message to probe
  with. Either probe sends a real request — a save without a file, or a share sheet — and a timeout
  cannot be told from a slow shell.
- **Trust the handshake with no withdrawal.** Rejected: the message map can disagree with the
  handlers, and a session of failing buttons is the cost the withdrawal removes.
- **Bump `BRIDGE_VERSION` and gate on it.** Rejected: the version is one number for every message,
  so a shell built with a newer bridge but without these handlers would still pass.
- **Hand the shell the cached bytes when the page has them.** Rejected: whether the page has them
  depends on the bucket's CORS. Two paths, one of them only sometimes, for no gain over a download
  the shell does anyway.
- **Wait for iOS to fail the dropped download.** Rejected: it may never fail within a session, and
  the button would stay busy.
- **The buttons in the top bar, beside close.** The first placement. Rejected on the device: the
  result toast lands on top of them and takes the presses meant for them.
- **Save all side by side.** Rejected: several first saves would each wait on the same permission
  prompt, and the shell would run a burst of downloads for one tap.
- **Share all.** Not offered: `ShareFile` takes one file, and taking several is a shell contract change.

## Consequences

- **An older app shows a viewer exactly as before.** No button, no toast.
- **A shell whose handshake claims more than it handles costs the user one failed press per
  session**, then the buttons are gone. The router test is what keeps that from shipping.
- **A download on a slow but live connection that sends nothing for thirty seconds is cancelled.**
  A progress event of any size restarts the window, so only a real stall reaches it.
- **Android cannot report whether a share reached a target.** It answers as soon as the chooser is
  up, so its result is read as "dismissed" and stays silent.
- **The upload catch-up and the download catch-up share one list.** Each reads only its own
  direction. A future third direction would need its own reader, or both would ignore it.
- **The viewer has a slot only this consumer uses today.** Nothing else in the kit knows about
  saving.
- **The close button is still under a toast for its five seconds.** The toast swipes away upward;
  moving close as well would put it where no one looks for it.
- **A save all that meets a refused permission stops at that photo.** Those already saved stay saved,
  and the toast speaks for the permission rather than the count.
