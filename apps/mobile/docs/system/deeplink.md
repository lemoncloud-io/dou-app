# Deep Link

The deferred-deep-link backend (Firestore rules/indexes, cleanup functions, `.well-known` assets)
lives outside this app, at [docs/infra/deep-linking/](../../../../docs/infra/deep-linking/README.md) —
this doc covers only what runs inside the shell once a link arrives.

Universal links, the custom scheme, and a push notification tap all converge on **one goal**: turn
the inbound intent into a `WEBVIEW_URL`-relative `path`, and hand it to the web via the `OnNavigate`
bridge event. The shell never recomputes the frontend domain — the base is always `WEBVIEW_URL`
(`VITE_WEBVIEW_BASE_URL`), and cloud/site context (`cid`/`sid`) travels as query parameters on that
path for the web to read.

## Key files

| File                                                      | Role                                                                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/services/deeplinks/DeepLinkManager.ts`           | Captures raw OS URLs — cold-start (`getInitialURL`, plus an iOS native-module fallback for a buffered universal link, plus a short wait for a late `url` event) and warm-start subscription |
| `src/app/services/deeplinks/DeeplinkService.ts`           | The single resolver: `resolveInbound(url)` (`web`/`native`/`invalid`) and `resolvePushTap(data)`                                                                                            |
| `src/app/services/deeplinks/deeplinkUtils.ts`             | Pure helpers: validation, invite conversion (`convertShortUrlWithEnvsSync`), path reduction (`resolveDeepLink`), cid/sid/chatId merge (`resolvePushTapPath`)                                |
| `src/app/webview/hooks/useDeepLinkNavigation.ts`          | Single owner of inbound navigation: OS links, invite links and push taps → `OnNavigate` (web) / `navigationRef` (native) / the error screen                                                 |
| `src/app/features/core/navigation/navigationRef.ts`       | Shared navigation ref for applying `target=native` routes (see [../push/README.md](../push/README.md))                                                                                      |
| `apps/web/.../bridge/navigation/resolvePushNavigation.ts` | (web) Extracts and strips `cid`/`sid`/`chatId` from the `OnNavigate` path, switches cloud/site, then opens the thread for a reply                                                           |

**On iOS the links enter through `SceneDelegate`, not the app delegate.** The app uses the scene
life cycle (the iOS 27.1 SDK requires it), so a cold-start URL or universal link arrives in the
scene's connection options rather than `didFinishLaunching`'s launch options, and a warm one in
`scene(_:openURLContexts:)` / `scene(_:continue:)`. `SceneDelegate` copies the cold-start ones back
into the launch-options keys React Native reads (`getInitialURL`, `getInitialNotification`) and
forwards the warm ones to `RCTLinkingManager`, so nothing on the JS side changed.

## Structure

```mermaid
flowchart TD
    OS["OS deep link / universal link"] --> Manager["DeepLinkManager"]
    Push["Push tap (onNotificationOpenedApp / getInitialNotification)"] --> Coord
    Manager --> Coord["useDeepLinkNavigation"]
    Coord --> Resolve["DeeplinkService.resolveInbound / resolvePushTap"]
    Resolve -->|"native (target=native)"| Native["navigationRef.reset (Debug)"]
    Resolve -->|"web / push tap"| Navigate["bridge.pushEvent(OnNavigate, { path })"]
    Resolve -->|"invalid"| Error["deepLinkError screen"]
    Navigate --> Web["WebView (resolvePushNavigation)"]
```

The bridge buffers `OnNavigate` until the `WebAppReady` handshake completes (see
[../webview/README.md](../webview/README.md)), so a cold-start link or tap is delivered as soon as the web is ready —
no manual startup delay is needed.

## Which links reach the app

A `https` link opens the app only when the OS sees the tap and finds the app claiming that path:

| Link                    | iOS (`apple-app-site-association`) | Android (`AndroidManifest.xml`)                 |
| ----------------------- | ---------------------------------- | ----------------------------------------------- |
| `/i?t=…`                | `"/i"`                             | `android:path="/i"`, exact                      |
| `/s?code=…`             | `"/s"`                             | `android:path="/s"`, exact                      |
| `/s/`, `/s/{code}`      | `"/s/*"`                           | `android:pathPattern="/s/.*"`                   |
| `chatic://…` (any path) | the custom scheme in `Info.plist`  | the custom-scheme filter, no host or path limit |

**The two platforms claim the same paths, and nothing else on the host.** The host is the landing
site, so a claim on any other path takes that page away from anyone with the app installed. The
association file used to claim `*`, and an iPhone app installed on a Mac from the App Store then
opened in place of the landing page itself, in Safari, on `/`. Both also used to claim `/auth/*`,
which no link on this host has ever used — the landing site has no such page, and its `/auth/login`
redirect goes to the web app's own domain — so it was dropped. The iOS list lives in the landing
app's `public/.well-known/` and reaches users with a landing deploy, not an app release — though
Apple's CDN caches the file, so a device can keep the old list for a while.

**A query string is not part of the path Android matches.** `/s?code=…` has the path `/s`, which a
`/s/.*` pattern does not match — that filter alone, written for the retired `/s/{code}` shape, left
every current `/s` invite opening the browser on Android, SMS included. Query links therefore get an
exact `android:path`, never a prefix: a prefix on `/s` or `/i` would also claim unrelated pages on
the same host. A change to the Android filters reaches users only with an app release.

**A link the OS never sees does not open the app at all**, whatever the filters say. An in-app
browser (KakaoTalk, Instagram, …) loads the URL itself, and so does a browser given a typed, pasted
or explicitly handed-over URL. Those links land on the landing site's bounce page, which hands them
over through the custom scheme.

**The app also writes one custom-scheme link itself.** A share from another app opens the app on
`<scheme>://share?id=<id>` — the iOS share extension opens that URL, and Android rewrites the share
intent to it before React Native reads the intent — and it resolves like any other custom-scheme link,
to the web path `/share?id=<id>`. See [../native/share-intake.md](../native/share-intake.md).

## Invite link conversion

An invite link must be converted into a form the web recognizes; `convertShortUrlWithEnvsSync` does
this. There are two `/s` input forms, and **whether `relay` is present is the discriminator**; a
third, encoded form (③) carries both in one token.

**① Cloud form** (the link itself carries a backend address)

- Input: `https://app-dev.chatic.io/s?code=invt:910447:...&api=uzjpiaey7a&stage=dev`
- Output (relative path): `/?code=invt:910447:...&provider=invite&version=2&_backend=https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev`

**② Relay form** (the relay server needs no backend address)

- Input: `https://app-dev.chatic.io/s?code=invt:910447:...&relay`
- Output (relative path): `/?code=invt:910447:...&provider=invite&version=2&relay=1`

Conversion rules:

- `code` is preserved as-is; `provider=invite` and `version=2` are appended.
- `_backend` comes from `backend` verbatim if present, otherwise from `api`+`stage` as
  `https://{api}.execute-api.{region}.amazonaws.com/{stage}` (`region` is the
  `INVITE_BACKEND_REGION = ap-northeast-2` constant).
- A relay-form link **omits `_backend` and states `relay=1` explicitly** instead — a deliberate
  marker so the web decides "relay" from that flag rather than from the absence of `_backend`. The
  backend address for a relay link comes from the web's own `getDynamicRelayBackend()` (an env
  relay endpoint).
- `relay` is judged by **presence (`searchParams.has`), never by value** — a bare `&relay` parses to
  an empty-string value, which a truthiness check on `get('relay')` would miss. Whatever form it
  arrives in (`&relay`, `relay=`), the output is always normalized to `relay=1`.
- Consumed parameters (`code`/`api`/`stage`/`backend`/`relay`) are excluded from the forward loop;
  everything else (`utm_*`, etc.) passes through unchanged.
- **No domain is added.** The output is a host-less relative path; the final domain is applied later
  by `WEBVIEW_URL`.

**③ Encoded form** (`/i?t=<base64url(JSON)>` — the same values packed into one token)

- Input: `https://app-dev.chatic.io/i?t=eyJjIjoiaW52dDo5MTA0NDc6Li4uIiwiciI6MX0`
- Output: the same relative paths as ① and ②. The token is opened by `@chatic/shared`'s
  `readInviteLink` — the one decoder landing, the web and desktop-web use too — and its payload
  states relay explicitly (`r`), so a missing address is never read as relay here.
- **Characters glued onto the end of the token are ignored.** A link pasted into a chat can arrive
  as `…/i?t=eyJ…입니다` or `…eyJ…)`, when the messenger's link detection runs past the URL. Nothing
  outside base64url is ever written into `t`, so the decoder reads up to the first such character
  and opens the link as issued. A truncated token still fails — its missing bytes cannot be
  recovered — and resolves to `invalid`, which shows the "Unable to open invite link" screen.
- **React Native's query parser throws on a malformed `%` escape** anywhere in the query (`…%EC%9`, a
  percent-encoded character cut in half), where a browser's never does. The decoder then reads `t`
  from the raw query; the `target` marker check treats such a query as carrying no marker; and the
  extra parameters (`utm_*`, …) are not forwarded, since they cannot be read — the invite still opens.
- The two damage lines carry the link's shape, never the token (it holds the invite code): an
  unreadable link logs a warning with `failedAt` (the step that refused it), `length` and
  `ignoredChars`; one opened only after dropping characters logs an info line with `length` and
  `ignoredChars`. An intact link logs neither. (The `resolveDeepLink` trace line before them still
  logs the URL, which the uploaded log redacts.)

A `/s/{code}` legacy short-code link is no longer supported and resolves to `invalid` —
`convertShortUrlWithEnvsSync` throws for it, and the old Firestore-backed short-URL lookup it used is
gone.

## The `OnNavigate` path contract

The `path` handed to the web via `OnNavigate` follows these rules:

- **Shape**: `pathname + search + hash` — no domain. The WebView's base is always `WEBVIEW_URL`.
- **`cid`/`sid`** travel as query parameters. The web (`resolvePushNavigation`) reads them, switches
  cloud/site, then strips them and routes on what remains — they are session context, not route
  parameters.
- **`chatId`** rides a push tap's query the same way: the web strips it, lands on the room, and pushes
  the thread on top when that chat is a reply. A chat that is not one leaves the reader in the room,
  so the shell merges it for every chat push and never judges whether it is a reply.
- Both the deep-link path and the push-tap path go through `DeeplinkService` (via
  `useDeepLinkNavigation`) and converge on this same contract.

For a push tap specifically, `resolvePushTapPath` also decides what a **linkless** payload does: a
push whose `type` is one of `ROOTED_PUSH_TYPES` (currently just `cloud`, whose payload carries no
`link` by contract) resolves to `/`; every other linkless payload resolves to `null` and only
foregrounds the app — a chat push with no link is treated as a malformed payload, not a request to
navigate away from wherever the user already is. When a link does exist, `cid`/`sid`/`chatId` are
merged into its query only if the link does not already carry them explicitly. Android merges the
same three natively (`ChaticFirebaseMessagingService.mergeContextIntoLink`), since its background tap
reaches the web through the intent URI rather than through this function.

## ⚠️ React Native URL pitfall (regression risk)

When assembling a path or query, **do not use `new URL(...).searchParams.set()` and then read
`.pathname + .search`.** React Native's built-in `URL` (`react-native/Libraries/Blob/URL.js`)
derives its `.search` getter from the original string (`_url`) via regex, and does **not** reflect
values set through `URLSearchParams.set()`. The result is an invite link silently losing its entire
query and collapsing to `/`. Node's/Jest's `URL` does reflect the mutation, so a unit test passes
while a real device breaks.

- Reading (`searchParams.get/has/forEach`, the `.search`/`.pathname`/`.hash` getters) is safe.
- **Write by assembling the string directly** (`encodeURIComponent` each value) — this is how
  `convertShortUrlWithEnvsSync` and `resolvePushTapPath` build their output.
  (`react-native-url-polyfill` is not installed anywhere in the app.)

## Change checklist

- Does any new path/query assembly avoid RN `URL`'s `searchParams.set()` + `.search` pattern? (see
  the pitfall above)
- Does a new link path have its Android filter — an exact `android:path` for a link whose data is in
  the query — and the same path in the landing app's `apple-app-site-association`?
- Is a new deep-link kind reflected in `resolveDeepLink` (native) and in whatever consumes `resolveInbound` on the web side?
- Is an invite link's output a host-less relative path, with the frontend domain never recomputed
  outside `WEBVIEW_URL`?
- Is `OnNavigate`'s `path` shaped `pathname+search+hash`, with `cid`/`sid` (and a push tap's `chatId`)
  carried in the query?
- Does it still match the web's `resolvePushNavigation` contract (read `cid`/`sid`/`chatId` from the query,
  then strip them)?
