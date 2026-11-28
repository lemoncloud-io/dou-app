# @chatic/shared

**The old entry point.** Most of what this barrel exports now lives in a package of its own, and the barrel
re-exports it under the same names, so the files that import `@chatic/shared` did not change. New code
imports the package that owns a name. What is still implemented here has no owner yet; the list is in
[What stays here](#what-stays-here).

Tags: `layer:ui` · `platform:web` · `formfactor:any`. Each re-export of a package this one may not reach by
its tags (an adapter, the runtime binding, a non-buildable package) carries an
`@nx/enforce-module-boundaries` exception with its reason; they go when the barrel does.

## Where the names went

| Names                                                                                                       | Package                                                                         |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `readInviteLink`, `decodeInviteLink`, `isEncodedInviteUrl`, `formatDate`, `createQueryKeys`                 | [`@chatic/format`](../foundation/format/README.md)                              |
| the phone helpers behind `@chatic/shared/phone` (`toE164`, `isValidMobileNumber`, `listPhoneCountries`, …)  | [`@chatic/format/phone`](../foundation/format/README.md)                        |
| `usePinnedChannels`, `useChannelOrder`, `useCloudOrder`, `usePlaceOrder`, `placeScopeKey` and their writers | [`@chatic/preferences`](../features/preferences/README.md)                      |
| `useCustomMutation`, `useDebounce`, `useInterval`, `useGlobalLoader`, `useLoaderStore`, `useVersionCheck`   | [`@chatic/runtime-react/react-utils`](../runtime/react/README.md)               |
| `STORE_URLS`, `getStoreUrl`                                                                                 | [`@chatic/host-web-browser`](../host/web/browser/README.md#store-links)         |
| the image code (`prepareImage`, `prepareChatAttachment`, `makeVideoPoster`, the policies, …)                | [`@chatic/host-web-browser`](../host/web/browser/README.md#images--mediaimages) |
| the mini app rules (`subWebViewTrustOf`, `readSubWebViewAppLink`, `checkMiniAppLink`, …)                    | [`@chatic/mini-app-protocol`](../mini-app/protocol/README.md)                   |

The public export list of the barrel, of `@chatic/shared/phone` and of `@chatic/shared/subWebViewTrust` is
the same as before the move.

## What stays here

```text
libs/shared/src/
├── index.ts          public barrel
├── components/       the error screens, GlobalLoader, VersionUpdateBanner, LoadingFallback
├── consts/           ERROR_MESSAGES + the store links re-export
├── hooks/            usePageTransition (useNavigateWithTransition) + re-exports of react-utils
├── image/            re-exports of host-web-browser's image code
├── phone/            useOtpExpiryCountdown + re-exports of the format phone helpers — NOT in the barrel
├── preferences/      re-export of @chatic/preferences
├── types/            four declarations, no reader
└── utils/            membershipOverride, subWebViewTrust (the desktop entry) + re-exports
```

- **The components** (`ErrorFallback`, `RouterErrorFallback`, `NotFoundPage`, `GlobalLoader`,
  `VersionUpdateBanner`, `LoadingFallback`) and their copy table `ERROR_MESSAGES` belong to the design-system
  patterns, which come per form factor. Only `apps/web` mounts the first five, so their place is the mobile
  patterns package — but this barrel cannot re-export a `formfactor:mobile` package: desktop-web and admin
  (`formfactor:desktop`) and landing import it, and the form-factor rule follows dependencies through it.
  They move when `apps/web` imports them from the patterns package itself. `LoadingFallback` is used by both
  web apps and has no home in a per-form-factor package yet. See [The components](#the-components).
- **`useNavigateWithTransition`** (`hooks/usePageTransition.ts`) — see below. Its place is the mobile
  patterns package or the app; it reads the host profile from `@chatic/bridges`, which a design-system
  package does not, so it waits for that decision.
- **`useOtpExpiryCountdown`** (`phone/`) — a React hook, so it cannot join the pure phone helpers in
  `@chatic/format`.
- **`isAdminOverrideActive` and `resolveEffectiveProductId`** (`utils/membershipOverride.ts`) read the
  admin override on a membership. **They read the raw fields, not the derived `status`.** The relay derives
  `status` once at write time and nothing sweeps it afterwards, so a lapsed override leaves
  `status: 'active'` behind. `isAdminOverrideActive` compares `adminUntil` with a required `now` (a missing
  time treated as `0` would make every expired override read as active). An empty `adminStatus` is the
  release encoding, and an absent or `0` `adminUntil` means indefinite: the wire has no special value for it.
- **`types/`** — `PaginationType`, `TokenGenerateRequest`, `TokenGenerateResponse` and
  `TokenGeneratorFormState`, named by no file outside this lib.
- **`utils/subWebViewTrust.ts`** is the `@chatic/shared/subWebViewTrust` entry the desktop shell's main
  bundle aliases (`apps/desktop/electron.vite.config.ts`); it re-exports the protocol file by relative path,
  because that bundle resolves no package names.

### `useNavigateWithTransition`

`navigate` with a platform page transition, and the most-imported symbol of this barrel. It takes the same
options and returns the same promise as `@lemoncloud/react-page-transition`'s hook, but starts the
transition itself through `@lemoncloud/page-transition-core`'s `executePageTransition`, feeding it the
platform the shell injected (read from `@chatic/bridges`' host profile).

- **It does not use the React package's hook, because that hook let the browser capture the incoming
  screen before it existed.** A view transition captures the new screen as soon as its update callback
  settles; the package's callback settled as soon as `navigate` returned. React renders a route change in a
  later task, and `navigate(-1)` does not reach the router until the browser has moved entries, so for every
  back arrow the capture was the screen being left. `waitForDestination` (now in
  `@chatic/runtime-react/react-utils`) makes the callback wait for the first DOM change after the
  navigation — for a history delta, after `history.state` shows the other entry — capped at 300ms; the page
  does not paint while it waits, so the cap bounds a freeze, and only a navigation that renders nothing
  reaches it. A lazy screen whose code has not loaded commits its Suspense fallback first, and that fallback
  is what is captured, as before.
- **A navigation made while one of its transitions is running goes through without a second transition,**
  after the running one has navigated. The package clears every class it set when a transition finishes, a
  newer running transition's included, so overlapping two would drop the second one's motion midway.
  `animation: 'none'` also skips the transition and the wait.
- **It puts `data-page-transition` on `<html>` for as long as a navigation runs,** cleared when the last
  overlapping one settles. That attribute is a DOM contract, not an import: WebKit paints no
  `backdrop-filter` inside a view transition's snapshots, and web-ui-kit's `HeaderGlass` reads it to keep a
  glass header opaque through the slide instead of frosting in one frame at its end. The name is spelled out
  in both libs and pinned by both libs' tests. It is not set on Android — the WebView there is Blink, which
  paints the frost inside the snapshots (measured in Chrome 154), so holding a header opaque there would only
  delay its glass.
- **The animations themselves are CSS the app loads,** not this lib: the package's stylesheet, and
  apps/web's own Android override after it
  ([apps/web page transitions](../../apps/web/docs/shell/page-transitions.md)).

### The components

```text
apps/web
  ├─ app.tsx     <ErrorBoundary FallbackComponent={ErrorFallback}> · <Suspense fallback={<LoadingFallback/>}>
  ├─ routes/     errorElement: <RouterErrorFallback onError={…}>
  └─ runtime/    <GlobalLoader/> · useVersionCheck() → <VersionUpdateBanner/>
```

- **They bring no translations with them.** `VersionUpdateBanner` reads `version.*` keys and the three error
  screens read `error.screen.*` (`components/useErrorScreenText.ts`), all from the consuming app's locale
  files. Every error-screen lookup carries its English default from `ERROR_MESSAGES`, because these screens
  render when something already failed — possibly the `/locales` request itself — and a raw key there would
  be worse than English. `useErrorScreenText` never suspends: the app's top-level error boundary sits outside
  its `<Suspense>`.
- **`LoadingFallback`** names its `status` region from `common.loading` with an English default, because it
  renders while the locales are still on their way, and draws no logo: in the app the launch splash is the
  only screen that does.
- **`ErrorFallback`** is a `react-error-boundary` fallback: it classifies the error by substring — both
  English and Korean, so `'연결'` reads as a network failure the same as `'network'` — and focuses its own
  container so a screen reader lands on the error. It matches Korean substrings but no bare English words
  such as `token`, `server` or `request`, which appear in ordinary crashes ("reading 'accessToken'",
  "Unexpected token '<'") and would send a plain bug to the login screen.
- **`RouterErrorFallback`** is the router's `errorElement` and classifies `isRouteErrorResponse` by status;
  a 404 renders `NotFoundPage` and, deliberately, does **not** call `onError`.
- **`GlobalLoader`** portals the logo over the page while `useGlobalLoader` (now in
  `@chatic/runtime-react/react-utils`) says a blocking task runs. **`VersionUpdateBanner`** is `fixed`, so it
  caps itself at the host's `--app-width`; the host renders it when `useVersionCheck` finds a newer build.

## Uploading a picture

The image code lives in [`@chatic/host-web-browser`](../host/web/browser/README.md#images--mediaimages),
which also offers it as the `media` port's `images` capability; this barrel re-exports it under the same
names. Its reasoning is kept here, where its callers look for it.

One function, `prepareImage`, and the **destination** picks the policy — because the two upload paths have
opposite constraints, and leaving that to each caller is how one of them ends up sending an uncompressed
base64 blob.

```ts
await prepareImage(file, AVATAR_IMAGE); // avatar — square crop, base64
await prepareImage(file, REPORT_PHOTO); // feedback screenshot — whole frame, tighter budget
await prepareChatAttachment(file); // chat photo — CHAT_ATTACHMENT, but a GIF goes without a thumbnail
```

- The destinations are **named policies** rather than options spelled out per call site, because the
  avatar one used to be written at seven of them. A one-off variation spreads and overrides
  (`{ ...AVATAR_IMAGE, maxEdge: 64 }`). The parts underneath — `decodeImage`, `compressToBlob`,
  `toUploadFile` — are exported too, but composing them by hand means taking on the pairing `prepareImage`
  enforces.
- `'inline'` is a base64 data URL for a record field or an inline payload, and it is **always compressed**:
  base64 costs about four bytes per three, so the encoded size is the budget. It rejects on failure, because
  its caller has nothing to store instead.
- `'storage'` is bytes PUT to object storage, and **the original goes up at full size**. "The original"
  means _not resized_, not _not touched_: HEIC is still converted to JPEG and renamed, because the endpoint
  takes no HEIC and answers it with a 415. An animated GIF is never redrawn, and a chat photo of one gets no
  thumbnail, because a canvas thumbnail keeps only the first frame and the room would draw that still as the
  tile.
- Picking the wrong `fit` loses data: `'cover'` center-crops to a square, for avatars, and `'contain'` keeps
  the whole frame and never upscales.
- **EXIF orientation is decided once, in `decodeImage`, by reading through an `<img>`.** A source the
  browser cannot read (HEIC outside Safari) gives `null`, not a rejection.
- **A video poster is held to the server's thumbnail ceiling** (200,000 bytes). `makeVideoPoster` seeks with
  the `#t=0.5` URL fragment, because setting `currentTime` on a paused element never completes on iOS
  WebKit, waits `settleMs` after the frame is reported ready, because Android's WebView reports `seeked`
  before the frame is readable, retries once on a blank frame, and gives up with `null` rather than blocking
  an upload.

## React Native reaching into the barrel

`apps/mobile` imports `STORE_URLS` from this barrel for its store-update prompt, and `@chatic/host-mobile`
takes `getStoreUrl`, the invite decoder and the page link rules from it, each import with a boundary
exception. Metro resolves the tsconfig paths and does not tree-shake, so whatever this barrel re-exports
lands in the phone bundle whether or not it runs there; a re-export added here must load without a DOM at
module init, and should come from the narrowest entry the owning package offers — which is why the phone
helpers come from `@chatic/format/phone` and the hooks from `@chatic/runtime-react/react-utils`. Their suites never load the barrel itself: they `jest.mock('@chatic/shared')`.

## How to verify

```bash
npx tsc -b libs/shared/tsconfig.json --force   # lib and spec projects, what nx's typecheck runs
npx jest --config libs/shared/jest.config.js
```

- Type checking must be `tsc -b`. Inside `libs/shared`, `tsc --noEmit` checks zero files and succeeds.
- The jest config lists the nested packages (`@chatic/format`, `@chatic/preferences`,
  `@chatic/runtime-react/react-utils`) and the subpath entries before the generic `@chatic/*`
  rule, which would otherwise send them to folders that do not exist. `@chatic/assets` is stubbed with the
  web app's mock because it builds URLs with `import.meta.url`.
- `tsconfig.spec.json`'s `references` must mirror `tsconfig.lib.json`'s, or the siblings arrive as unlisted
  files (TS6307), and its `outDir` stays `dist/out-tsc/shared-spec`, apart from the lib project's.
- `hooks/websocket-worker-queue.test.ts` declares the queue it tests inside the test file, so it exercises
  nothing in this lib.
- Downstream: a changed barrel identifier reaches `apps/web`, `apps/desktop-web`, `apps/admin`,
  `apps/landing`, `apps/mobile` and `libs/host/mobile`. `@chatic/mobile` is on `verify.yml`'s exclusion list,
  so run it by hand.
