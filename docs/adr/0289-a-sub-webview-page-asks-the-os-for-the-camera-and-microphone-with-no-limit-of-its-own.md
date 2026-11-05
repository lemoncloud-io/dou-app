# ADR-0289: A sub WebView page asks the OS for the camera and the microphone, with no limit of its own

> Status: Accepted · Decided: 2026-11-05 · Implemented: `feat/sub-webview-device-permissions`
> · Scope: `libs/bridge-messages` (`model/sub-webview.ts`, `SubWebViewRequestType`) · `libs/bridges`
> (`BRIDGE_VERSION` 2.20.0) · `libs/chatic-apps-sdk` · `apps/mobile/src/app/subWebView/`
> · The specification is [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md)
> · Related: [ADR-0265](./0265-a-page-on-another-origin-opens-in-a-sub-webview-with-a-bridge-of-its-own.md),
> which left device features to the OS and to review; [ADR-0278](./0278-a-sub-webview-page-declares-what-it-reaches-in-a-manifest-on-its-own-origin.md),
> the manifest this deliberately does not extend

## Context

ADR-0265 left the camera, the microphone and the file pickers to the OS and the WebView's defaults,
on the ground that only reviewed pages reach the allowlisted domains. A page that wants the camera
calls `getUserMedia`, and the WebView decides on its own:

- **Android** grants it whenever DoU holds `CAMERA` or `RECORD_AUDIO`, and asks the OS for them when
  it does not.
- **iOS** asks with WebKit's own prompt on top of the OS's, and the sub WebView lacks
  `allowsInlineMediaPlayback`, which the main WebView sets, so a camera preview does not play inside
  the page.
- **The OS prompt names DoU.** A user who allows "DoU would like to access the camera" for one page
  has allowed it for every page and for the main app.
- A page cannot ask whether DoU has a permission, ask for it before it needs it, or send a user who
  refused it to the settings. On Android a `<input capture>` opens nothing when DoU lacks `CAMERA`.

Pages are now written outside the team, so we weighed limiting the camera and the microphone to the
pages whose manifest asks for them, kind by kind, with the user's own consent per page. Doing that for
real means refusing a capture inside the WebView, and `react-native-webview` cannot: Android has no
setting that refuses one page, and iOS has one setting for both kinds. It would mean patching the
library and carrying the patch through every upgrade of it.

## Decision

**The camera and the microphone stay open to every reviewed page, and the administrator who approves
a page answers for what it does with them. The app gives pages a way to ask well, and adds nothing
that limits them.**

- **Three requests, in the base set** — `GetSubWebViewPermission`, `RequestSubWebViewPermission` and
  `OpenSettings` — go through the `PermissionService` the main web already uses. `query` reports where
  DoU stands with the OS without showing anything: `granted`, `prompt` (not asked, or refused and may
  be asked again) or `blocked` (the OS will not ask again). `request` shows the OS prompt and answers
  once the user has decided. `OpenSettings` opens DoU's page in the OS settings, for `blocked`.
- **A page captures with `getUserMedia`, as before.** The requests only let it learn where it stands
  and ask when the user reaches for the feature, so the OS prompt does not arrive in the middle of a
  capture. A page that skips them still works.
- **The sub WebView plays media inline** (`allowsInlineMediaPlayback`) and answers a capture from its
  own host without WebKit asking a second time after the OS, and one from another host with a no
  (`mediaCapturePermissionGrantType="grantIfSameHostElseDeny"`).
- **No manifest permission and no dialog of DoU's.** A page's use of a device is judged in the review
  every page passes before it is deployed to an allowlisted origin, as ADR-0265 decided.
- **Out of scope**: location (the app declares no location permission, so it needs an app release and
  a reason the stores accept), contacts, notifications and the photo library.

## Alternatives

- **Manifest permissions `camera` and `microphone`, a consent dialog naming the page, and the app
  refusing every other capture.** Designed and built, then dropped. It answers the real weakness —
  the OS prompt names DoU, so one allowance serves every page — but only by patching
  `react-native-webview` on both platforms, applying the patch on every install with `patch-package`,
  and carrying a native module on each. The cost is a fork of a library the app depends on and an app
  release for every change to it; the gain is a limit review already provides.
- **Patch only iOS, or only Android.** Rejected: a limit on one platform is no limit a reviewer can
  rely on.
- **Gate the file inputs as well.** Rejected: the user acts in a system interface for each file, and a
  page cannot reach the camera through it without the user taking the picture.
- **Do nothing.** Rejected: iOS cannot show a camera preview in the page, and a page cannot ask
  before it captures or send a blocked user to the settings.

## Consequences

- Three requests join the sub WebView's vocabulary and `BRIDGE_VERSION` is 2.20.0. Both shells need an
  app release for them and for the two iOS WebView settings; until then the handshake does not list
  them and a page falls back to `getUserMedia` alone.
- **The OS's allowance for DoU is every page's.** Once the user allows the camera for one page, every
  page on an allowlisted origin that calls `getUserMedia` meets no further prompt. The review is the
  only check on which pages use it, and the administrator who approves a page answers for that use.
- The library stays unpatched: nothing to reapply when `react-native-webview` is upgraded.
- If a limit per page is wanted later, it is this ADR's rejected alternative, and the first step is
  patching the library as described there.
- That iOS plays a camera preview inline and that the second WebKit prompt is gone have not been
  checked on a device.
