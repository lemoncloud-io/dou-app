# ADR-0281: Sub WebView pages talk through chatic-apps-sdk, kept beside the app

> Status: Accepted · Decided: 2026-11-03 · Implemented: `feat/chatic-apps-sdk`
> · Scope: `libs/chatic-apps-sdk` (new) · `apps/mobile/src/app/subWebView/chaticAppsSdk.contract.test.ts`
> · The library's own documentation is [libs/chatic-apps-sdk/README.md](../../libs/chatic-apps-sdk/README.md);
> the protocol it speaks is [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md)
> · Related: [ADR-0277](./0277-the-sub-webview-page-protocol-is-specified-and-versioned-apart-from-the-bridge.md),
> which specified the protocol; [ADR-0278](./0278-a-sub-webview-page-declares-what-it-reaches-in-a-manifest-on-its-own-origin.md),
> its permissions

## Context

Sub WebView pages are to be written by people outside the app's team, often with an AI assistant,
and submitted for review. Speaking the protocol by hand means getting a dozen details right that an
assistant reliably gets wrong: listening on both `window` and `document`, matching replies by `refId`,
reading two refusal shapes, holding timeouts while the page is hidden, setting claims again after a
back-forward cache restore, reading the context from the handshake rather than a global that Android
can define late. The two pages that existed each carried a hand-written client, and the copies had
already drifted from each other and from the app.

## Decision

**Pages use one library, `chatic-apps-sdk`, which lives in this repository as `libs/chatic-apps-sdk`
and is published as `@lemoncloud/chatic-apps-sdk`.**

- **A small surface over the protocol**: `connect()` shakes hands and returns one object whose methods
  name what a page does (`finish`, `share`, `getUserKey`, `onBack`, `onCloseRequest`, …). Every
  detail above is the library's, not the page's. Failures are one error type with a `code`.
- **One page for both places**: outside the app `connect()` returns the same interface with browser
  stand-ins (Web Share, the clipboard, `document.title`) and `NOT_IN_APP` for what needs the app, so
  a page opened from a link in a browser still runs.
- **No runtime dependencies, framework-agnostic**: ES modules and CommonJS, plus a script-tag build that
  defines `window.ChaticAppsSDK` for a page with no bundler.
- **A mock of the app** at `./mock`, so a page can be built and tried in a browser tab with the
  permissions its manifest will ask for. It is a stand-in and is documented as one.
- **Kept beside the app so the two cannot drift**: its public types are declared in the library — the
  message definitions are a private package — and a type-level test pins each to its counterpart
  there; a contract test in the app runs the library against the app's real page host and handlers,
  and pins the library's bridge version to the app's.
- **Errors are reported by default**: `connect()` sends uncaught errors to the app's log, so a page
  that breaks on users' phones is visible to the people who can withdraw it.

## Alternatives

- **Keep the protocol document as the only interface.** Rejected: the drift between the two existing
  hand-written clients is what that produced, and an assistant writes a new one per page.
- **A repository of its own.** Rejected for now: the types would be copied with nothing to hold them
  to the app, and no test could run the library against the host. A mirror can publish from here if
  outside contributors need issues and releases of their own.
- **A framework (React components, a CLI, a build step).** Rejected: pages are written in whatever an
  author or an assistant picks; a framework would choose for them and grow the surface to review.
- **Bundle the app's message types into the published declarations.** Tried: the bundler left imports
  pointing into the monorepo. Declaring the few public types here and pinning them by test is simpler
  and fails loudly.
- **Fail every bridge call in a browser.** Rejected: pages reached through an app link in a browser
  should still work wherever the browser can stand in.

## Consequences

- One new library in the workspace. CI lints, typechecks and tests it with the rest; building it is
  `nx build @chatic/chatic-apps-sdk`, into `dist/libs/chatic-apps-sdk`.
- Publishing to npm is not wired up yet: it needs the `@lemoncloud` scope's credentials and a release
  step of its own.
- A change to the protocol now has a third place to change in the same pull request — the library —
  and the contract test fails until it does.
- The library's version and the bridge version move separately; `SDK_BRIDGE_VERSION` is pinned to the
  app's `BRIDGE_VERSION` by the contract test.
