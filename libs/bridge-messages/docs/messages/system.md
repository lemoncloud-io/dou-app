# Handshake, device and OS surfaces

Source: `system.ts`, `device.ts`, `clipboard.ts`, `haptic.ts`. See the [index](./README.md) for conventions.

## Handshake

- **`WebAppReady`** (web→native, reply `OnWebAppReady`) — the web announces itself once its bridge is up;
  the reply tells it what this shell can do. Works even when the web and app deploys are out of step.
    - Web sends `webVersion`, `protocolVersion`, `supportedWebMessages` (the requests the web can send) and
      `holdsBootSplash`: `true` when this web build will send `FirstScreenReady`. A shell holding its launch
      splash waits for that signal when it is `true` and lifts the splash on the handshake itself when it is
      absent, since an older web would otherwise sit under the splash until the shell's safety cap.
    - Reply `supportedWebMessages` lists the requests the shell has a handler for, not the whole
      vocabulary, and `supportedAppMessages` the replies paired with them (pushes are not listed).
      Every phone shell from app 0.30.0 (bridge 2.9.0) lists its handlers.
    - Reply cache fields overlap on purpose: `cacheDomainVersions` (per-domain contract version the app
      implements; wins when present), `supportedCacheTypes` (legacy name list, read as "version 1 of
      each") and `cacheSchemaVersion` (the physical SQLite version, kept for debugging and for old web
      bundles; no longer used for routing). A host with no local cache DB, the Electron main process,
      sends none of them. Negotiation: [runtime-web's cache doc](../../../runtime-web/docs/cache/README.md).
    - `capabilities` carries feature flags; new features are negotiated there before use.
    - `subWebView` is sent only by a sub WebView's own host: the same object as `window.ChaticSubWebView`,
      sent at a moment the page knows, because on Android the global can be defined after the page's first
      script. Absent from the main shell and from apps before 2.15.0.
    - `subWebViewOpenScope` (since 2.22.0) is sent by the main window's host only: how far its
      `OpenSubWebView` opens (`reviewed` or `anyHttps`). Absent means `reviewed`. The web offers a control
      that opens an owner's own link only when this says `anyHttps`.
- **`Ping`** (web→native, reply `Pong`) — liveness probe; the host answers it itself (since 2.6.0).
- **`FirstScreenReady`** (web→native) — the web's first screen is painted, so the shell may lift whatever
  covers the WebView while it boots (the launch splash, or the cover shown while a crashed WebView
  reloads). Fire-and-forget: an older shell answers `NOT_FOUND` and nothing waits for the reply.
- **`DismissResumeOverlay`** (web→native) — remove the overlay the shell shows when the WebView returns
  from the background.

## Native→web pushes

- **`OnUpdateDeviceInfo`** — device and version info (`DeviceInfo` plus `VersionInfo`). `deviceId` is
  deprecated (a `deviceId:firebaseInstallId` composite) and `installId` is deprecated (it carries the bare
  device id despite its name); use `uniqueDeviceId` (stable across reinstalls) and
  `firebaseInstallationId` (changes on reinstall).
- **`OnBackgroundStatusChanged`** — the app went to the background or came back; `status` is
  `active | background | inactive`, with `isBackground` / `isForeground` derived flags. Also the only
  remaining source of this value: the old `FetchBackgroundStatus` request is gone.
- **`OnBackPressed`** — the native back (swipe or hardware button) was pressed; see `SetCanGoBack` for when
  the shell sends this instead of going back itself. A sub WebView page that claimed back receives it too.
- **`OnNavigate`** — navigate the web to `path` (relative, with its query, for example a push tap or deep
  link); `replace` selects a replace instead of a push (default `false`). `perfTrace` hands over a
  performance trace the shell began for this navigation (a notification tap), which the web stops when
  the room shows its messages; absent from older apps, which makes the web start its own.

## Navigation and chrome

- **`SetCanGoBack`** (web→native) — tell the shell whether the page can go back itself. When `true`,
  in-page routing handles back first. `includesHistory` (since 2.34.0): `canGoBack` is the page's whole
  answer, covering open overlays and its own history, so the shell decides from it alone and does not add
  the WebView's history (which lags or misses `pushState` entries). Absent from older pages, whose
  `canGoBack` covered open overlays only.
- **`OpenURL`** (web→native) — open a URL in the default browser or another app (`http`, `mailto`, `tel`,
  ...). Passing the app's own scheme (`chatic://...`) round-trips through the OS and returns as an inbound
  deep link, which is why this message is also how deep-link routing is tested.
- **`OpenSettings`** (web→native) — open the app's page in the OS settings.
- **`SendSms`** (web→native) — open the SMS composer; `phoneNumbers` is one number or an array. The reply's
  `success` means the composer opened, not that a message was sent.

## Permissions and device data

- **`RequestPermission`** (web→native) — show the OS permission prompt for `CONTACTS`, `NOTIFICATIONS`,
  `CAMERA`, `PHOTO_LIBRARY` or `MICROPHONE`; the reply carries a `status` of `GRANTED`, `DENIED`, `BLOCKED`
  or `UNAVAILABLE`. A new permission name only needs this union extended when the shell already maps it.
- **`GetContacts`** (web→native) — read the contact list after the permission is obtained.
  `permission` is `granted | denied`; it is optional because a shell from before it never sends it, and
  without it an empty list is ambiguous (a denial and an empty address book look the same). On iOS,
  partial access arrives as `granted` with only the contacts the user picked, because the contacts
  library's status call never settles on iOS 18 and later for partial access. A birthday's `year` is
  optional: some contacts hold only month and day, and iOS omits `year` then.
- **`OpenShareSheet`** (web→native) — the OS share sheet for text and a link.
- **`OpenDocument`** (web→native) — the document picker (`type` is a MIME allow-list, `includeBase64`
  returns bytes inline).
- **`OpenCamera`** / **`OpenPhotoLibrary`** (web→native) — capture or pick media through the system UI;
  `quality` is `0` to `1`, `maxWidth` / `maxHeight` are pixels, `selectionLimit` of `0` means unlimited.
  The in-app grid and the chat attachment pickers are separate messages, see
  [files-and-media.md](./files-and-media.md).
- **`FetchAppIcon`**, **`FetchAppIconList`**, **`ChangeAppIcon`** (web→native) — read the active alternate
  icon, list the choices, switch. An `iconName` of `null`, absent or `'default'` restores the default.
  Replies say whether dynamic icons are `supported` on the platform; `ChangeAppIcon` returns the key
  actually applied, which may differ from the one requested.

## Small native calls

- **`CopyToClipboard`** (web→native) — write `text` to the native clipboard; the reply's `copied` says
  whether it worked.
- **`TriggerHaptic`** (web→native) — play one short haptic of a `HapticKind`. The kind names the feel, not
  the gesture, and each shell maps it to its own platform feedback: `selection` (lightest tick, a control
  snapping), `impact` (firmer tap for a committing threshold), `success` / `warning` / `error` (the outcome
  of something the user did). `success`, `warning` and `error` need bridge 2.16.0; before that a reply is
  `INVALID_KIND` and a post plays nothing. The shell honours the device's touch-feedback setting, and the
  reply only says the haptic was handed to the OS.
- **`CreateDummyFile`** (web→native, debug) — create a sparse file of `sizeInBytes` for transfer testing.

## Constants

- `USER_AGENT_PREFIX_IOS` / `USER_AGENT_PREFIX_ANDROID` — the prefix the phone app appends to its
  WebView's User-Agent. They say which shell is speaking, not what it can do (capabilities come from the
  handshake).
