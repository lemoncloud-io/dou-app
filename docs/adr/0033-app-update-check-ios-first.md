# ADR-0033: App update prompts — query the live version directly, iOS first

> Status: Accepted · Decided: 2026-07-29

## Context

- The app (a WebView hybrid) needs to compare its current version with the version actually published
  (live) in the store, show an update prompt on the web screen, and send the user to the store.
- Previously the mobile shell checked only the iOS version through an iTunes lookup and handled it with a
  `window.CHATIC_APP_*` global injection plus a native alert. The web had no way (request/response) to
  query when it wanted, and `shouldUpdate` was a string on the injection path and a boolean on the bridge
  push — a type mismatch.
- The key constraint: **a version in review (not yet approved) must never be reported as "an update is
  available"**, because the user would be sent to the store for something they cannot get.
- Android has no public API for the live version (the Play Developer API needs server authentication).

## Decision

1. **The version source is the actually published live version, and nothing else.**
    - iOS: queried in-app through an iTunes lookup
      (`https://itunes.apple.com/lookup?bundleId=io.chatic.dou`). It returns only approved, released
      versions, so it is self-correcting and needs no authentication or backend.
    - Android: a backend endpoint (`GET /app-version?platform=android`, with the server querying the Play
      Developer API) is the only safe source, and it is **out of scope this round**.
2. **Scope = iOS first.** Android is handled safely in versionService by always reporting "no update"
   (it is unsupported today, so this is not a regression). The contract is designed platform-neutral, so
   wiring Android to the backend later changes as little of the front end as possible.
3. **Communication = add request/response, keep the existing injection.**
    - Add the `CheckAppUpdate` / `OnCheckAppUpdate` contract (response:
      `{platform, currentVersion, latestVersion, updateAvailable, storeUrl, forceUpdate?}`) and
      `OpenStore` / `OnOpenStore` to `libs/app-messages`.
    - The web queries on demand with `appBridge.checkAppUpdate()` and native returns the result.
      `updateAvailable` is returned as a boolean, resolving the type mismatch of the old string injection.
    - The existing `window.CHATIC_APP_*` global injection stays, for the first render.
4. **The mobile logic becomes a service.** Move the logic of the existing `useAppVersionCheck` hook into
   `apps/mobile/src/app/services/version` (the existing service pattern: types, a class, a provider
   singleton), leaving the hook, the injection, the alert and the bridge handler as consumers of that
   service.
5. **The prompt is an optional update notice.** Shown once per version (persisted by adding
   `dismissedUpdateVersion` to `usePreferenceStore`), not a forced update. Only the `forceUpdate` field is
   reserved in the contract.

**In scope:** the app-messages contract, versionService (the iOS iTunes lookup, the comparison, opening
the store), refactoring the existing hook and injection, the WebView bridge handler, extending the web
appBridge, the web update prompt, and tidying the store link on MyPage.

**Out of scope (follow-up):** querying the Android live version (once the backend `GET /app-version` is
ready), a forced-update UI, a What's New view, and the `registerHandler` wiring in the native app repo
(outside this repo — it needs checking separately).

## Alternatives

- **Publish the latest version through Firebase Remote Config** — dropped. Publishing by hand from the
  console or CI when the version bumps opens a window where a version in review is reported as live, and
  once querying the live version directly became possible, Remote Config, a new native dependency, a
  native rebuild and the publishing script were all unnecessary.
- **Call the iTunes lookup from the web directly** — dropped. Deciding the version is the native shell's
  responsibility (it is the only side that knows the current version, through DeviceInfo), and the browser
  has CORS limits.
- **Handle it with the injected globals (`CHATIC_APP_*`) alone** — dropped. It cannot re-query after the
  first render (on returning to the foreground, say), and it cements the string/boolean type mismatch.
- **Include Android in this round** — held. The backend endpoint has to come first, and until it exists
  any front-end implementation only creates the risk of a false positive.

## Consequences

- **What is gained:** a false positive for a version in review is structurally impossible (only the live
  version is queried). iOS works with no backend and no authentication. The web can query when it wants
  (on ready, on foreground). The version logic gathers into a service and becomes testable.
- **What is accepted:**
    - Android users get no update prompt until the backend is wired up (the same as today).
    - The iTunes lookup can lag by a few hours after a release because of CDN caching — acceptable for an
      optional notice.
    - Registering the bridge handler in the native app repo remains work outside this repo.
- When Android is wired up: only versionService's `getLatestVersion('android')` has to become a backend
  fetch, and the contract, the web prompt and the store link are reused unchanged.
