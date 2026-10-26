# Share intake

What another app shares to Dou through the OS share sheet. The shell receives it and nothing more: it
copies the shared items into its own `attach-pick` folder (Android as the intent arrives; iOS at the
first `FetchShareIntake`, out of the inbox the share extension wrote), keeps any shared text beside
them, and opens the app on `<scheme>://share?id=<id>`. The web's share page asks for the items by that id, lets
the person pick where they go, and sends them as it sends a pick from the documents picker.

The destination list and the send are not here, and cannot be. The session tokens, the cached clouds,
places and rooms, and the sockets a send rides all live in the WebView; a share sheet that picked a
room by itself would need a second copy of each, in Swift and again in Kotlin.

## Files

| Layer             | File                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Messages          | `libs/app-messages/src/types/model/share-intake.ts`                                                                   |
| WebView handler   | `src/app/webview/hooks/shareIntakeHandlers.ts`, `useShareIntakeHandler.ts`                                            |
| TS native wrapper | `src/app/bridge/ShareIntakeBridge.ts`                                                                                 |
| Android intake    | `android/…/share/ShareIntake.kt`, `share/core/ShareIntakeRules.kt`, `MainActivity.kt`                                 |
| Android module    | `android/…/module/ShareIntakeModule.kt`, `bridge/ShareIntakePackage.kt`                                               |
| Android filters   | `android/app/src/main/AndroidManifest.xml` (`SEND`, `SEND_MULTIPLE`)                                                  |
| iOS extension     | `ios/ChaticShareExtension/` — `ShareViewController.swift`, `Info.plist`, entitlements                                 |
| iOS module        | `ios/Bridges/ShareIntake/ShareIntake.swift`, `ShareIntake.m`                                                          |
| iOS shared rules  | `ios/Bridges/ShareIntake/Core/ShareIntakeCore.swift` (built into the app, the extension and the core tests)           |
| Tests             | `android/app/src/test/…/share/core/ShareIntakeRulesTest.kt`, `ios/ChaticTransferCoreTests/ShareIntakeCoreTests.swift` |

## Messages

| Request              | Reply                  | What it does                                                                      |
| -------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `FetchShareIntake`   | `OnFetchShareIntake`   | The share's items, refusals and text, by id; waits while Android is still copying |
| `ReleaseShareIntake` | `OnReleaseShareIntake` | Forgets the share; with `discard`, deletes the copies too                         |

An item has the shape the documents picker answers with: a `file`, or a `video` that may still need
`PrepareVideo`. A photo is a `file` too, and the web reads its bytes with `ReadAttachment` at the send,
so a shared photo is resized and given a thumbnail like any other. Because each copy lives in a
folder of its own, `attach-pick/<uuid>/`, the upload's allowed roots, the video conversion and the day-old sweep take them
with no change of their own.

## The id is the only thing the web sends

The handler accepts an id only in the one shape the native side makes, a UUID, and refuses anything
else as `INVALID` before native code builds a folder path from it. The web is remote content; `../`
must never reach the file system.

Failures keep their meaning for the web: `GONE` for a share the shell no longer holds (released, or the
OS cleared the cache), `INVALID` for a malformed id, `INTERNAL` for the rest. Never `NOT_FOUND` — the
web reads that as "this app has no share intake" and stops asking.

## Release

Cancelling on the share page releases with `discard`, which deletes the copies at once. A send releases
without it: the uploads that were just started are still reading the files. The `attach-pick` sweep
removes the folder later — it runs before the next pick, and takes folders untouched for a day. A
release for an id the shell does not hold succeeds — it already happened. A discard that leaves a copy
on the phone fails with `INTERNAL` and the handler logs it; the sweep removes it a day later. A discard
deletes the copies even if a `FetchShareIntake` for the same share is still on its way back, so the page must not discard
a share it is about to send.

## Android

`MainActivity` declares `SEND` and `SEND_MULTIPLE` for photos, videos, `application/*` documents and
plain text. When one arrives — at launch or while the app is open — `ShareIntake.take` gives it an id,
starts copying its streams on a background thread, and hands the screen a `VIEW` of
`<scheme>://share?id=<id>` in its place. React Native reads the launch URL from the screen's intent, so
at launch the swap happens before the React host starts; while open, `onNewIntent` passes the swapped
intent on and it arrives as any tapped link does.

The copy starts at once because the read grant belongs to this delivery of the intent, and the web asks
only once it has loaded. `FetchShareIntake` waits for a copy still running; the web's request allows ten
minutes for a large video.

What is taken:

- **Only `content://` streams of other apps.** The filter is exported, so any app can send the screen an
  intent. A `file://` path, or a `content://` URI of one of this app's own providers, would have Dou copy
  its own private files and upload them — those are refused by name. The provider is judged without a
  `<userId>@` prefix, which the resolver drops before it finds the provider, so `content://0@<own>/…`
  is refused too. If the system will not list this app's providers, no stream is taken at all.
- **Only streams the sender granted.** A stream is copied only when the intent carries a read grant
  (`FLAG_GRANT_READ_URI_PERMISSION`) and the stream is among the URIs it covers. The system refuses to
  deliver a grant the sender could not give, so this keeps an app with no permissions from handing Dou
  a contacts or photos URI that Dou would read with its own permissions. A normal share always has the
  grant: the system adds it, with the streams, when the sender starts the share.
- **One item's failure is that item's.** An item that cannot be read, or fails in a way the copy did not
  expect, is refused by name; the others are still copied.
- **Ten items**, one message's worth. The rest are named as not sent rather than copied.
- **Each item held to the limit its format implies** — 20 MB for one of the server's photo formats,
  300 MB for an MP4, 50 MB for anything else — as the documents picker holds a pick. The web is not asked
  for its ceilings because the copy runs before it exists; the numbers mirror the web's.
- Every item is reported as a `file`, as a documents pick is; the web tells a photo or a video by its
  type, and reads a photo's bytes at the send. A photo name made of a media id is replaced with one from
  when it was taken, as a pick's is.
- The shared text (`EXTRA_TEXT`) is kept beside the items. A share with neither a stream nor text is not
  a share, and the app opens as it would.

**Not taken twice.** The system hands the screen its first intent again when the app is reopened from
Recents, or when the screen is restored after the process died. That intent is left alone; taking it
again would copy with a grant that may have lapsed and open the share page over whatever the person was
doing.

**One at a time.** A new share discards any earlier one still pending — its page is replaced by the
new share's anyway — so an app sending share after share cannot pile copies up in the cache.

**Held in memory.** The pending shares live in the process. A share the process did not live to hand
over is lost: the screen restored afterwards does not take its intent again (see above), so the app opens
as it would, and the copies wait for the sweep. A page that still asks for it gets `GONE`. Every share sweeps before it copies, as every
other writer of `attach-pick` does.

## iOS

The `ChaticShareExtension` target is Dou in the share sheet. It shows a spinner and nothing else: it
copies what it was given into the App Group's inbox, `<group>/ShareIntake/<app bundle id>/<id>/`, one
folder per item, writes the share's `manifest.json` last, and opens the app on
`<scheme>://share?id=<id>`. The app's bundle id and scheme come from the extension's build settings
(`HOST_BUNDLE_IDENTIFIER`, `APP_URL_SCHEME`), so the dev and store builds on one phone each read only
their own inbox.

What the extension takes:

- **Up to ten photos, videos or files**, as the sheet's activation rule says; the rest of a larger
  share are named as not sent.
- **A web link and plain text become the share's text.** A file is never read as text, even a text
  file — it goes as a file — and a file URL is never sent as text, since it would be a path on this
  phone. Text that cannot be read is named as not sent. When no attachment carries text, the text an app
  put on the shared item itself (`attributedContentText`) is taken instead — beside a link it is usually
  the page's title, so it is not added then.
- **Photos in a format the server takes**, as stored. Any other photo — HEIC from the camera — is asked
  for as JPEG, which the photo's provider converts; if it cannot, the photo goes as it is and the share
  page names it as not sent.
- **A video as stored.** The app judges it as a picked video, so one that is not yet an H.264 `mp4` is
  converted by `PrepareVideo` at the send.

An extension may not call `UIApplication.open`. The application object is reached through the responder
chain and asked to open the URL by selector. If that does not work — the system refuses, or a future
iOS removes the path — the sheet says DoU could not be opened and the share was not received, and
closes on Done. That share is not recovered: the app never learns its id, and the inbox entry is deleted
a day later, before the next share is taken.

The sheet also stays open, with its own message, when the share could not be written to the inbox (no
App Group container, a full disk) and when nothing handed over is something Dou can send. The extension
logs which step failed, never what was shared.

`FetchShareIntake` reads the manifest, moves each item into a pick folder of its own under
`attach-pick` and judges it as the documents picker does: held to the limit its format implies, reported
as a `file`, or as a `video` with `needsExport` when it must be converted. The manifest is deleted
before anything moves, so a share is never taken twice; the rest of the inbox entry goes once the items
have. The answer is kept in memory so a page reload gets the same items until the release. A manifest
path that is not `<slot>/<name>` inside the share's own folder is not read, and a manifest that cannot
be read at all — malformed, or of a version this app does not know — answers `GONE` and is deleted,
since asking again cannot help.

**Held in memory, as on Android.** Once fetched, the share lives in the process: if iOS ends the app
before the page sends or cancels, a reload gets `GONE` and the pick folders wait for the day-old sweep.
That sweep runs before every pick and every share, so a share page left open for more than a day can
find its files gone at the send; the upload then fails as any upload of a missing file does.

The rules both sides must agree on — the id, the manifest and the paths it may name, what an item is
taken as, its name, and what counts as text — are `ShareIntakeCore`, one file compiled into the app and
the extension and tested without either.

## Logging

The handler, and the Android intake in logcat, log counts only — how many items, how many refused,
whether there was text. What someone
shares can say more about them than a log should hold.
