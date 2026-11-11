# ADR-0271: A sub WebView page gets a key per origin, derived from the device id

> Status: Accepted · Decided: 2026-11-02 · Implemented: `feat/sub-webview-user-key`
> · Scope: `libs/bridge-messages` (`model/sub-webview.ts`, `SubWebViewRequestType`) · `libs/bridges`
> (`BRIDGE_VERSION` 2.14.0) · `apps/mobile/src/app/subWebView/` (`subWebViewUserKey.ts`,
> `subBridgeHandlers.ts`, `SubWebView.tsx`)
> · The module doc is [apps/mobile docs/webview/sub-webview.md](../../apps/mobile/docs/webview/sub-webview.md)
> · Related: [ADR-0265](./0265-a-page-on-another-origin-opens-in-a-sub-webview-with-a-bridge-of-its-own.md),
> which gave a sub WebView page nothing that identifies the device, the install or the user

## Context

ADR-0265 gave a sub WebView page a context and a small bridge, and on purpose nothing that
identifies the device, the install or the user. That holds for a page that only shows something, but
not for one that keeps state on its own server — a game that saves progress, say. Such a page needs
a stable key to keep a user's data under, and today it has two ways to get one, both weak: its own
sign-in, which asks the user for an account they do not want for a small page inside DoU, or an
anonymous sign-in kept in the WebView's storage, which is lost when that storage is cleared or the app
is reinstalled.

Other apps that host pages like these hand each hosted page a user key of its own: a hash that is
stable for one user and one page, different for every page, and given without a consent prompt
because it reveals nothing a page could link to anything else. The shell already holds a stable
device id — the one the main WebView is given — so the same can be built without a server.

## Decision

**A sub WebView page may ask for `GetSubWebViewUserKey` and gets `{ key }`: HMAC-SHA-256 keyed by
the device id over a fixed label and the origin the view was opened on, as 64 lower-case hex
characters.** It joins `SubWebViewRequestType`, so the sub WebView's handshake lists it.

- **One key per device and origin.** The same device on the same origin gets the same key every
  time; each origin gets a different one, and without the device id no one can tell two origins' keys
  belong to one device or work back from a key to the id.
- **The origin is the shell's record**, the origin of the URL the view was opened on — never
  anything in the request. The host answers only that origin anyway (ADR-0265), so a page can only
  ever get its own key.
- **The device id is reused, not made anew**: react-native-device-info's `getUniqueIdSync()`, which
  the main WebView receives as `CHATIC_APP_UNIQUE_DEVICE_ID`. It never leaves the shell for a page.
  With none, the reply is `UNAVAILABLE`, never a key that every device without an id would share.
- **The salt is a fixed label in the source, and it is public.** It keeps this use of the device id
  apart from any other and does nothing more. The key's unlinkability rests on the device id, which
  pages never see; whoever holds that id — DoU's own logs and crash reports — can recompute any
  page's key, and that is accepted. **The label never changes**: changing it re-keys every page and
  orphans every page's data. A different derivation would be a new request.
- **A key lasts as long as the device id.** On iOS that id is the vendor id (a random UUID without
  one) when first read, then kept in the keychain (this device only) and the app's user defaults: it
  outlives a reinstall and goes with an erase, unless the phone is restored from a backup. On Android
  it is `ANDROID_ID`, one per app signing key, user and device on Android 8+ (one per user and device
  on 7.x): it outlives a reinstall of a build signed with the same key and goes with a factory reset. The module
  doc tabulates the cases.
- **The key is not the DoU account and not proof of anything.** A page's server receives it from the
  page's script and cannot tell a real key from any other 64 hex characters. A server that has to know
  a request came from the app on that device needs a token the app signs — a later step, not built
  here.
- **No prompt, and ADR-0265's rule narrowed rather than broken.** The key is an identifier, but one
  scoped to the page's own origin: it tells a page nothing it could link to another page, the device
  or the account. An origin's server could in principle try to recover the device id from a key by
  brute force; Android's 64-bit id puts that far out of practical reach, and iOS's UUID further.

## Alternatives

- **Hand the page the device id.** Rejected: every page would get the same value, so pages could link
  their users to one another and to everything else that carries the id.
- **A secret salt built into the app** (a build setting rather than a constant in the source).
  Rejected: it can be read out of the app binary, so it only guards against someone who has the device
  id but not the app; every build and CI job would need it; and losing or changing it re-keys every
  page as surely as changing the label.
- **A random secret per install, kept in the app's storage.** Rejected: on Android that storage goes
  with an uninstall, so keys would not survive a reinstall, and the device id would add nothing.
- **A random id per origin, kept by the app.** Rejected for the same reinstall reason, with a store to
  manage on top.
- **SHA-256 over the device id and the origin, concatenated.** Workable, but HMAC is the standard way
  to key a hash on a secret, and needs no rule for where one input ends and the other begins.
- **A key per DoU account rather than per device.** Not now: a page would be tied to the account, a
  guest has none, and the account is per cloud. With a signed token it can come later.
- **A signed token now.** Deferred: it needs a signing key and something a page's server can verify
  against, which is the central part ADR-0265 left for later.

## Consequences

- One request joins the vocabulary (104 requests); `BRIDGE_VERSION` is 2.14.0. The main shell and the
  desktop shell list it as unsupported, as they do the other page-facing requests.
- A page that relies on the key loses its data with the device id: an erase or factory reset, a new
  phone (on iOS, unless restored from a backup), and on Android a build signed with another key. A
  page that needs data to follow a person across phones needs an account of some kind.
- DoU itself can link a page's key to a device, since it holds the device id; pages cannot.
- The mobile bundle gains crypto-js's HMAC, SHA-256 and hex modules; the mobile test config turns on
  `esModuleInterop`, which those CommonJS modules need under ts-jest.
- Pages ask only when the handshake lists the request, so an app without it answers `NOT_FOUND` and
  the page falls back to its own sign-in; the app change ships on its own.
