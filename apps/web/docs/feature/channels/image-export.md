# Image export — save and share in the viewer

**Inside an app that can, the image viewer saves the showing photo — or every photo of the message —
to the phone's library, or puts the showing one on the share sheet.** The page does not hold the
photo's bytes, so the shell downloads the original itself and hands its own file onward; the page
only starts the download, waits, and reports the result. A browser tab and an app built before downloads show neither button.

What the shell does with each message — where a download lands, which files it lets out, the
permission prompts — is [apps/mobile media-export.md](../../../../mobile/docs/native/media-export.md)
and [file-transfer.md](../../../../mobile/docs/native/file-transfer.md). This document is the page's
side.

## Why the shell downloads

WKWebView ignores `<a download>`. And the page cannot hand the shell the bytes it shows, because it
may not have them: a tile draws the signed address straight into `<img>` when storage sends no CORS
headers ([image-send.md](./image-send.md#the-image-cache)), and the production bucket is not known to
send them. The shell fetches the address as a plain HTTP client, where CORS does not apply. So the
export never reads the page's image cache, even when it holds the photo.

## When the buttons are there

`bridge/shellCapabilities.ts` holds what the app's handshake said, and `useCanExportImages()` is true
only when `supportedWebMessages` lists **both** `SaveToPhotoLibrary` and `ShareFile`. `main.tsx`
gives it the handshake reply the moment it arrives; before that, and in a browser where there is no
reply, the answer is false.

That is a different reading from the photo picker's, which learns from its first `NOT_FOUND` and
never looks at the handshake. The picker can afford to ask, because asking is invisible: the attach
menu just shows no recent photos. A button cannot — on an older app it would be there, and pressed,
before anything was learned. The two known faults of the handshake are covered instead:

- **It arrives asynchronously.** Here it races nothing. The buttons start hidden, and the viewer opens
  long after boot.
- **It is built from the app's compiled message map, not its registered handlers.** The app's router
  test fails when either message has no handler. And if a press still meets `NOT_FOUND`,
  `withdrawImageExport()` hides the buttons for the rest of the session, with a toast asking for an
  app update.

**Where they sit.** Share at the left end and save at the right end of a bar along the viewer's
bottom edge (`renderFooter`); the top bar keeps only the position and the close button. The top is
where a toast slides in, for five seconds, and a toast is pressable: buttons up there would be
covered by the very toast their last press raised. The viewer also ignores presses on anything drawn
over it from outside its own dialog — a toast — or pressing a toast's **Settings** would close the
viewer on the way and never reach the button. A tap on the viewer's own backdrop still closes it.
Keys and drags on a sheet the buttons open stay with the sheet: React events bubble through portals,
so the viewer acts only on events from its own DOM, and the sheet keeps the photo it was opened on.

Which photos get them: a sent image (its address is `https:`). A photo still on its way has only a
page-local `blob:` preview the shell cannot fetch, so both buttons show but are disabled. While a
save or share runs for an image, its other button is disabled and the one working shows a spinner,
or a ring once the download's length is known. The working one stays focusable and only ignores
presses, so keyboard and screen-reader focus does not drop out of it, and the ring is a
`progressbar`. A second tap inside the same frame is ignored too. The state is kept per upload
(`hooks/useImageExports.tsx`), so it survives swiping between images.

## The flow — `lib/imageExport.ts`

`exportImage({ action, url, name, signal })` with its dependencies passed in, so it is tested without a
shell:

1. **Download.** `runtime/transfer`'s `nativeGet` sends `StartFileTransfer` with
   `direction: 'download'`, `method: 'GET'`, a name hint and a title for the Android notification —
   never a path; the shell decides that. A start the shell never answers may still have begun, so it
   is cancelled rather than forgotten.
2. **A 403 is retried once.** The signed address expired while the room was open. The message is read
   again (`chat.getChat`) and the same upload's new address is downloaded — its original, or its
   thumbnail when it has none, the same rule the viewer opens by. A second 403, or no newer address,
   is a failure. The retry depends on the server signing a different address: one it signed moments
   ago comes back unchanged, and downloading that again would only meet the same 403.
3. **Save or share** the file the shell returned — `appBridge.saveToPhotoLibrary(uri)` or
   `appBridge.shareFile(uri, name)`.
4. **A `SOURCE` failure runs the flow once more from the download.** The OS may clear the shell's
   cache between the download and its use.
5. **Acknowledge** that download, after the save or share. The flow acknowledges only downloads it
   started; one that brought no file is acknowledged by `nativeGet` at once. An acknowledgement drops
   only the shell's record of the result, never the file — the file stays until the shell's daily
   sweep — so the order is bookkeeping, not what keeps the file alive.

An `INVALID` from the save or share means the shell refused a file it handed out itself. That is a
bug on one side or the other, so it is logged as well as reported as a failure.

| Outcome                                    | What the user sees                     |
| ------------------------------------------ | -------------------------------------- |
| saved                                      | "Saved to Photos" toast                |
| shared, or the sheet closed with no target | nothing — the sheet was the feedback   |
| permission refused                         | toast with a **Settings** button       |
| not an image the library takes             | "can't be saved" toast                 |
| network failure, or the download stalled   | "check your connection" toast          |
| any other failure                          | "couldn't save or share" toast         |
| `NOT_FOUND`                                | "update the app" toast; buttons hidden |
| save all: every photo saved                | "Saved N photos" toast                 |
| save all: some saved, and the run went on  | "Saved M of N photos" toast            |
| no answer within ten minutes, or cancelled | nothing — the button just comes back   |

Android cannot say whether a share reached a target: it answers as soon as the chooser is up, with
`completed: null`, which is read the same as a dismissed sheet. Neither is a failure, and on Android
the buttons come back while the chooser is still open.

## The waits

- **Save and share wait ten minutes** (`MEDIA_EXPORT_TIMEOUT_MS`), not the bridge's default fifteen
  seconds. The first save waits for the OS permission prompt, and on iOS a share answers only when
  the sheet closes, however long the user keeps it open. Messages are dispatched concurrently in the
  shell, so a long share holds nothing else up.
- **A download with no new byte for thirty seconds is cancelled** (`DOWNLOAD_STALL_MS`) and reported
  as a network failure. iOS does not fail a download whose connection dropped: its background session
  keeps it `running` and retries for as long as days. Without a window here the button would never
  come back. The window starts when the shell accepts the download and restarts whenever bytes move.
- **The window is checked against the shell before it cancels.** On iOS the page's timers keep
  counting while the app is suspended, so a save left to finish in the background meets an expired
  window on return — ahead of its own terminal event and of the catch-up. When the window runs out,
  the page asks the shell for that download first: ended, it is settled as it ended; still moving,
  the window starts again; only otherwise is it cancelled. The shell's list can know bytes no event
  reported — iOS reports progress in steps — so a download cut off part-way can take two windows
  before it is cancelled.

## Save all — `saveAllImages`

On a message with more than one photo the shell can fetch, save asks first, in a sheet over the
viewer: **save this photo**, **save all (N)**, or cancel. N leaves out photos still on their way. A
message with one such photo saves at once, without the sheet. Share always takes the showing photo
alone — the shell's `ShareFile` takes one file.

Save all runs the flow above for each photo **one after another**, never side by side, so the first
save's permission prompt appears once and the shell is not handed a burst of downloads; each photo
keeps its own 403 retry, `SOURCE` retry and acknowledgement. A refused permission or `NOT_FOUND`
stops the run, since every remaining photo would get the same answer; any other failure skips that
photo. One toast ends the run (`toastForSaveAll`): a run that stopped speaks for the reason it
stopped, even after some were saved; otherwise it says every photo saved, some saved, or — when none
was — speaks for the last failure that had something to say. A photo already being saved or shared
when save all starts is left to that operation. While it runs, every photo of the run is busy, so
neither button can start a second operation on any of them, and the save button's ring runs across
the whole set, the current download's share included. Closing the viewer does not stop it.

## Closing the viewer

- **A share still downloading is cancelled**, and its sheet never opens — one that arrived after the
  user went elsewhere would cover whatever they went to. A file that lands after the close is
  acknowledged without opening the sheet. This holds however the viewer goes: closed, emptied by
  its images going away, or unmounted with the row when a push tap or a deep link leaves the room.
- **A save carries on** and shows its toast when done. It changes nothing on screen, so finishing in
  the background is what the user asked for.

## Catching up after the page was away

The shell holds each download's terminal state until it is acknowledged. When the page was suspended
or reloaded, `syncShellDownloads()` reads that list and settles each download the page still waits on.
It also acknowledges ended downloads that nobody waits for, left by a page that no longer exists.
It runs once for the page, from `GlobalBridgeListener` (`useShellDownloadCatchUp`): when the
handshake allows export, and each time the app returns to the front. Calls that overlap share one
request.

Uploads have their own catch-up (`runtime/upload/transferSync`), and each reads only its own
direction from the shared list. The upload catch-up acknowledges every ended transfer it reads. Were
it to read downloads too, it could acknowledge one whose terminal event the page missed while away;
the download catch-up would then find no record and fail a save that had succeeded.

## Where the code is

| File                                                | Holds                                                         |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `bridge/shellCapabilities.ts`                       | the handshake reading and the session withdrawal              |
| `bridge/shellDownload.ts`                           | the one download registry per page, and the page's catch-up   |
| `bridge/appBridge.ts`                               | `saveToPhotoLibrary`, `shareFile`                             |
| `runtime/transfer/nativeGet.ts`                     | start, wait, stall window, cancel, acknowledge, list catch-up |
| `features/channels/lib/imageExport.ts`              | the flow above, save all, and their toasts                    |
| `features/channels/hooks/useImageExports.tsx`       | the per-upload busy state, the dependencies, the toasts       |
| `features/channels/components/SaveShareButtons.tsx` | the two buttons and the save sheet                            |
| `features/channels/components/MessageImages.tsx`    | puts the buttons in the viewer, cancels shares on close       |
| `libs/web-ui-kit` `ImageViewer` (`renderFooter`)    | the bottom bar, and `ImageViewerActionButton`                 |

The decision is recorded in
[ADR-0155](../../../../../docs/adr/0155-the-viewer-offers-save-and-share-when-the-handshake-lists-both.md).

## Not done here

- **Save or share from a tile, or from the message's action sheet.** Only the viewer has them.
- **Sharing several images at once.** `ShareFile` takes one file; widening it is a shell change.
- **Desktop.** `apps/desktop-web` has its own viewer and is not touched here.
- **A browser.** A browser tab could offer a download link, but only for a photo whose bytes it holds,
  which depends on the bucket's CORS. Not offered.

## How to verify

```bash
npx jest --config apps/web/jest.config.js apps/web/src/app/bridge/shellCapabilities \
  apps/web/src/app/bridge/shellDownload apps/web/src/app/bridge/appBridge \
  apps/web/src/app/runtime/transfer apps/web/src/app/runtime/upload \
  apps/web/src/app/features/channels/lib/imageExport \
  apps/web/src/app/features/channels/hooks/useImageExports \
  apps/web/src/app/features/channels/components/SaveShareButtons
npx nx test @chatic/web-ui-kit -- ImageViewer
```

On a device, against the transfer test server (`scripts/upload-test-server.js`, whose GET scenarios
cover a plain image, a chunked one, a 403, a slow body and a cut-off one): open a sent photo, press
save, and find it in the library; on a message of three, choose save all and find three; press share
and close the sheet, and no toast should appear. Deny the permission and the toast's Settings opens
the system settings over the open viewer. Then cut the body off mid-download: Android reports a
network failure at once, while iOS keeps the download running until the window cancels it.

The page needs a current system WebView. An Android 9 emulator image without the Play Store keeps
WebView 66, which cannot run the page at all — dev or production build.
