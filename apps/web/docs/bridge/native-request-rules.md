# Native requests — timing and contracts the callers rely on

> Scope: `apps/web/src/app/bridge/` (`appBridge.ts` and the media, share and camera wrappers). The
> shape of the facade is in the [bridge README](./README.md); this page is the reasoning behind the
> choices a caller cannot see from a method signature.

## Why some requests do not use the default timeout

`@chatic/bridges` gives a request a 15 second budget. A request that times out drops the answer
that arrives afterwards, so a budget shorter than the real wait turns a result that was on its way into
a failure. Every method below waits on something other than the shell itself — a person or the OS:

| Request                                      | Budget       | What it waits on                                                                                |
| -------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `oauthLogin` (account linking)               | 3 minutes    | The user in the provider's own UI. Three minutes means "walked away".                           |
| `getContacts`, `RequestPermission`           | 60 s         | The first call raises the OS permission prompt inside the same request.                         |
| `ListPhotoAlbums`, `ListPhotos`              | 60 s         | The same permission prompt, on first use of the library.                                        |
| `ReadPhoto`                                  | 2 minutes    | An original kept only in iCloud is downloaded first.                                            |
| `KeepLibraryVideo`                           | 10 minutes   | A video kept only in iCloud is downloaded first, with no progress to show.                      |
| `ReadVideoFrame`                             | 25 s         | The shell gives up after 20 s; the page waits a little longer so the shell's answer settles it. |
| `ManagePhotoSelection`                       | 5 minutes    | The user choosing in the iOS system sheet.                                                      |
| `SaveToPhotoLibrary`, `ShareFile`            | 10 minutes   | The permission prompt on the first save; the share sheet staying open.                          |
| `FetchNativeStorageSummary`                  | 60 s         | A full scan of every cache table.                                                               |
| `StartAudioRecording` / `StopAudioRecording` | 5 min / 30 s | The first start waits on the OS prompt; a stop writes the file's end.                           |

The budgets are the defaults of the facade's methods (`appBridge.ts`, `audioRecorder.ts`); a caller
can pass its own.

## Starting a provider sign-in is not a round trip

`startOAuthLogin` posts the request and returns. The credential comes back later as an `OnOAuthLogin`
event, which the `signIn` port hands to its `onResult` subscriber. It is split from the request
because a request would carry the 15 second budget while the person is still in the provider's
account chooser, password or 2FA screen; a slower sign-in then expired, and the credential the user
had already earned arrived to a request nobody was waiting for. Signed in at the provider, still on
the login screen. With no timer there is nothing to expire.

- Every outcome must arrive on that event channel: success carries the credential, a cancel carries
  no result, and a failure carries `success: false`. A host-level error (`ERROR`, for example no
  registered handler) does not travel the event channel, so the native side has to keep reporting
  OAuth failures as an `OnOAuthLogin` response rather than throwing.
- `oauthLogin` (the awaited form) exists for account linking, whose caller needs the raw provider
  token in hand to run `verify` and then `confirm`. The two coexist safely: a pending request claims
  its own answer by its reference id, and only an unclaimed answer reaches event subscribers.

## The handshake reply is read, not just sent

`notifyWebAppReady` is a request because the reply is the capability handshake: it lists what the
_installed_ app can do, and a web build deployed ahead of that app cannot assume anything. It never
rejects — in a browser there is no bridge and it resolves `null`. `main.tsx` records the reply;
`shellCapabilities` answers every later "may I ask for this?" from it (see the
[README](./README.md)). The reply also says that this build sends `FirstScreenReady`, which is how a
shell tells it from an older build and waits for that signal before lifting its launch splash.

Other small contracts on the facade:

- `setCanGoBack` always marks its report as covering history, so the shell knows the answer already
  includes the page's own stack ([routing](../shell/routing.md)).
- `fetchPushMarks` drains the cross-cloud push marks the shell recorded for a background chat push:
  read and clear in one native call, so a mark is delivered once. It resolves empty in a browser or on
  a failed request.
- `sendSms` opens the native SMS composer and reports only whether the composer opened. The user
  still has to press send, so a resolved call is not a delivered message; it rejects in a browser and
  answers `success: false` when the composer did not open.
- A persisted preference write that must not be lost (the theme) uses the confirmed variant, which
  rejects on `success: false` and on timeout so the caller can retry.

## The in-app photo picker and attachments

- **Photos are read one at a time.** The shell keeps what was picked in its own folder and answers
  with addresses; the page then reads each photo's bytes with `ReadAttachment` so that at most one
  photo is ever on the bridge — ten photos in one answer would be hundreds of megabytes of base64.
  A photo that cannot be read is refused alone, as `unreadable`.
- **Album picks are read at once; document picks wait.** The documents picker returns everything it
  offers as `file`, photos included, and its pick waits above the composer for the send button. A
  photo in it therefore stays in the shell as an address until the send, and costs the page no
  memory while the caption is typed. It is still judged by format and size when picked, so an oversize
  photo is refused before any byte crosses the bridge, and it is resized and given a thumbnail at the
  send exactly like an album photo.
- **The type comes from the pick when the shell cannot tell.** A shell names a read photo by its
  file extension, and Android answers `application/octet-stream` for a file it cannot place (a
  document picked as `scan` with no extension). The type the picker reported is then the better word.
- An MP4 needs nothing special: the send tells a video by its format, not by the picker's `kind`.
- The picker is asked at the tap rather than when the attach menu opens, because the message itself
  opens it.

## Camera access

`cameraAccess.request()` asks the app for the camera before the page opens one. Android's WebView
never asks for itself when a capturing file input is tapped — without the permission it silently
drops the camera and the page hears nothing — so asking first is the only way to learn there is a
refusal to explain. Results are `granted`, `refused` (`DENIED` or `BLOCKED`; only Settings changes
it) and `unknown` (an error, a timeout, or a host with no camera permission port). On `unknown` the
page opens the camera as before and lets the OS have its say, provided the answer still arrived
inside the tap window.

A grant is remembered for the life of the page: both OSes end the app's process when a permission is
taken back in Settings, so later taps can open the camera straight from the gesture instead of
waiting on a round trip that may miss the tap window. A refusal is not remembered — the person may
allow it in Settings and come back.

## Share intake

`/share?id=` shows what another app shared into DoU. `GONE` (already released or swept) and `INVALID`
(an id the app would never have made) mean there is nothing to show and resolve to `null`. Any other
failure — a timeout, or `NATIVE_NOT_SUPPORTED` while the bridge is still attaching — rejects so the
page offers a retry, and is logged because the page only says that it failed. Releasing never
rejects: with `discard` the app deletes its copies (the person cancelled); without it the copies stay
for the uploads still reading them, and a release that does not land is left to the app's own
day-old sweep.

## Sub WebView links

- `bridge/subWebViewApps.ts` maps an app id to its origin per stage, so a page can move without its
  links changing. The shell's allowlist still decides what loads, so an origin listed here that the
  shell does not allow is refused when opened. Lookups use own keys only, so an id such as
  `constructor` cannot read through to the prototype.
- A link tapped in a chat counts as a page link in two shapes: the app link (`/apps/<appId>?…`, on
  either host, resolved for this build's stage) and a page's own address on this build's own page
  domain. A page on the other stage's domain would run against this build's session, so it goes to
  the OS like any other site.

## Foreground and background signals

`useAppVisibility` collapses same-direction signals inside 1 second, because one physical transition
can surface as both the native message and `visibilitychange`. The window is per direction and is not
a "fire only on change" filter: inside a shell the document's visibility can disagree with the real app
state (a background message lost to suspension), so a state-based filter could swallow a genuine
resume. Consumers that need exactly-once behaviour must deduplicate on their own state.
