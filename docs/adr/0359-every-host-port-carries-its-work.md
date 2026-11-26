# ADR-0359: Every host port carries its work

> Status: Accepted; the placement in decision 1 (`src/config/adapters/<port>.ts`) superseded by
> [ADR-0375](./0375-platform-implementations-live-in-libs-as-families-of-one-port.md) · Decided: 2026-11-19 · Implemented: `refactor/host-ports-media-files-signin-push`
> · Scope: `libs/runtime-client` (the `media`, `files`, `signIn` and `push` contracts, the push bindings,
> `appShell.systemSettings`, `links.subWebView.onClosed`),
> `libs/runtime-web` (every port's adapter factory), `libs/runtime` (`runtime.push`, `@chatic/runtime/testing`),
> `apps/web` and `apps/desktop-web` (their implementations and every caller), the root lint config
> · The behaviour is documented in [apps/web docs/bridge/host-ports.md](../../apps/web/docs/bridge/host-ports.md),
> [apps/desktop-web docs/host](../../apps/desktop-web/docs/host/README.md),
> [libs/runtime-client](../../libs/runtime/docs/api/README.md) and
> [libs/runtime-web](../../libs/runtime-web/README.md)
> · Builds on: [ADR-0352](./0352-a-host-port-carries-its-work-and-features-never-ask-which-side-does-it.md),
> and finishes what its "What stayed" left: the four ports that still carried only their choice

## Context

ADR-0352 moved `links`, `appShell` and `diagnostics` behind members and left `media`, `files`, `signIn`
and `push` carrying only `kind` (and `os` for `signIn`), because their implementations lean on app
modules: the native transfer module, the OAuth hand-off, notification handlers. About thirty reads in
`apps/web` and `apps/desktop-web` still branched on them, and the lint rule could not cover every port
while they did.

## Decision

### 1. The four ports follow ADR-0352's rules

Each port's members do its work, and the app implements both sides in `src/config/adapters/<port>.ts`
_(where they live is superseded by ADR-0375: each side moves into its host family in `libs/`)_:

- `media` — the app's attachment picker, its photo library, its video converter and its camera
  permission, each `null` where the page picks with its own input.
- `files` — `put`, which every host does (the app's transfer module or the page's own request), and
  `transfers`, the app's transfer module (shell-file uploads, open, save, a video's first frame), `null`
  in a browser and in desktop-web.
- `signIn` — facts that say what `kind` and `os` stood in for (`sessionScope`, `approvesPairing`,
  `requestsPairing`) and the two ways a provider sign-in runs: `providerSignIn` where the phone app signs
  in natively (the providers it offers, Apple only on iOS; starting a sign-in, hearing its result, and a
  credential for account linking) and `relayOAuth` where desktop-web goes through the relay and hands the
  code back.
- `push` — `notifications`, `deviceToken`, `tokenRenewal` and `localBanner`, each `null` where the host
  does not do it. The desktop app fills all four; the phone app the first two. The phone's token
  registration and desktop's notification subscribers and banners go through them too.

Two members join ports ADR-0352 already moved, because a caller here needed them: `appShell.systemSettings`
(the app's own page in the OS settings, which the contacts-permission banner opens) and
`links.subWebView.onClosed` (a sub web view closing, which desktop's settings and the web's mini-app
launcher listen for).

The lint rule now lists every shell-or-browser port; no feature reads their `kind` or `os`. Checkout's
`kind` is different — it names the way a host sells (`store`, `web`, `none`), the tag of its union — and
features read it on purpose.

### 2. The push port's members sit beside the push hooks

`runtime.push` was already a namespace of hooks, with the port reached only as `runtime.push.kind`. Its
members join that namespace the same way, each a live binding the start publishes into
(`runtime.push.notifications`, …), rather than a second name such as `runtime.pushPort`: a feature finds
everything about notifications under one word.

### 3. A subscription gate asks checkout, not sign-in

Two screens decided whether to offer a subscription from `signIn.kind`. That is the checkout port's
question, so they read `runtime.checkout.kind` (`store`, `web`, `none`). On every host the app ships
with, the answer is the same; on a host that declares a different checkout, the screen now follows the
checkout it declared.

## What stayed, and why

- **Handshake checks stay in the app.** Whether this shell version exports images or opens a sub web
  view arrives with the boot handshake, after the ports are published; the app still asks it at call
  time beside the port.
- **Direct `appBridge.openSettings()` calls that never read `kind`** — after a refused photo, voice,
  download, export or pairing permission, and on the debug screen — stay as they are: each sits on a path
  only the phone app reaches, nothing branches on a side there, and only the contacts banner, which did
  branch, moved to `appShell.systemSettings`.
- **The log pipeline still reads `diagnostics.kind`** in the declaration part, as ADR-0352 records.

## Alternatives

- **The push port as one object beside the hooks** (`runtime.pushPort.notifications`): one binding
  instead of four, but two names for one subject, and a caller would have to know which of them holds a
  given notification feature. Rejected for members inside `runtime.push`.
- **Keep `signIn.kind` as the subscription gate:** it gave the right answer on every shipped host, but
  only because a phone that signs in natively also sells through its store. Asking checkout says what the
  screen means and follows a host that sells differently.

## Consequences

- No feature can tell which side does a port's work; the implementations hold every such difference,
  and a new host is a new implementation per port.
- A test lays the members it needs on `browserMedia()`, `browserFiles()`, `browserSignIn()` or
  `browserPush()`.
- Where a host declares something the app never shipped with — a toggle forcing one port to the page
  while another stays on the shell, or a checkout the host did not ship with — a screen follows the port
  that owns its question, which can differ from the old `kind` proxy:
    - the contacts-permission banner opens settings where `appShell` is the shell's, not where `media` is;
    - My page's subscription row for a guest shows where checkout is `web`, and the cloud-manage
      subscription button where checkout is `store`, not where sign-in is the browser's or the shell's;
    - the required-update screen's store button does nothing where `appShell` is forced to the page (before,
      it posted to the app's store regardless).
