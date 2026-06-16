# 0009. Desktop Social Login runs in the system browser and returns via protocol deeplink

Date: 2026-06-12

## Status

Accepted

## Context

Desktop Web needs Social Login (v1: Google). The backend stack is complete:
the OAuth Relay (`oauth2.eureka.codes`) fronts every provider
(`/oauth/{provider}/authorize?redirect=...` → returns `?code=`), and the
backend exchanges that code for tokens (`POST /oauth/{provider}/token` —
already wrapped by `createCredentialsByProvider` in web-core). apps/admin
proves the web flow end-to-end. The only open question was where the
browser part of the flow runs for the Electron-hosted desktop client.

Two candidates:

1. **Inside the Electron window.** Navigate the renderer to the authorize
   URL; the relay redirects back to `desktop.dou.chatic.io/auth/oauth-response`
   (same origin as the app). Zero shell work — but an Electron
   `BrowserWindow` is an embedded webview, which Google's OAuth policy
   rejects (`disallowed_useragent`). The relay sitting in the middle may or
   may not mask this; it is a policy gamble either way, and user-agent
   spoofing workarounds are fragile and ToS-hostile.

2. **In the system browser, returning via deeplink.** The shell opens the
   authorize URL externally; the relay redirects to a desktop-web-hosted
   hand-off page, which forwards the `code` to the app through the
   `chatic://` custom protocol. This is the pattern Slack, Discord, and
   Notion use.

The deciding discovery: the Desktop Shell **already ships the entire
deeplink path** — `chatic:` protocol registration, single-instance argv,
macOS `open-url`, cold-start flush, window re-focus, and delivery to the
renderer as an `OnReceiveNotification` event (`apps/desktop/src/main/index.ts`).
Option 2 therefore needs **no shell change and no shell redeploy**; the
whole feature lands web-side, which ADR 0001's remote-load model deploys
independently.

## Decision

Social Login runs in the **system browser** and returns through the
**`chatic://` protocol deeplink**:

1. Welcome screen offers "Continue with Google" beside the Guest Session
   entry. Clicking it opens
   `{OAUTH_RELAY}/oauth/google/authorize?redirect={DESKTOP_WEB_HOST}/auth/oauth-response?...`
   in the default browser (via the shell's external-open path).
2. `/auth/oauth-response` on desktop-web is the hand-off page. Opened in a
   plain browser it immediately forwards to
   `chatic://oauth?code=...&provider=...` (with a manual "Open the app"
   fallback button). Opened inside the shell (capability-detected) it
   exchanges the code directly — so the flow degrades gracefully if the OS
   loses the protocol registration.
3. The renderer listens for the `oauth` deeplink on the unauthenticated
   router branch, then runs the existing engine path:
   `createCredentialsByProvider('google', code)` → `setIsAuthenticated`.
   No new auth machinery.

A Social Login session **replaces** any Guest Session on the device (same
contract as the existing debug login: `cloudCore.clearSession()`); there is
no guest→account merge in v1 — the backend exposes no merge API.

## Consequences

- No shell release is required; the feature deploys with desktop-web.
- Google policy compliance by construction — the OAuth UI runs in a real
  browser with real user agency (password managers, passkeys included).
- The relay's `redirect` back-address must accept
  `{DESKTOP_WEB_HOST}/auth/oauth-response`. Whether the relay enforces a
  redirect whitelist is unverified; if the first live test is rejected,
  registration with the relay operators is the unblock (tracked risk, not
  a design change).
- Adding Kakao later is a button plus relay/console registration — the
  flow is provider-agnostic.
- The deeplink hand-off depends on OS protocol registration; the hand-off
  page's in-shell exchange path and manual fallback button bound the
  failure mode.
