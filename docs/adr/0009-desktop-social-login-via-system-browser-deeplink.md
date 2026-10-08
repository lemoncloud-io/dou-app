# 0009. Desktop Social Login runs in the system browser and returns via protocol deeplink

Date: 2026-06-12

## Status

Accepted — the amendment's remaining risk is closed by [ADR-0178](./0178-desktop-google-sign-in-returns-by-deeplink-with-a-relay-code-and-no-client-secret.md)

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

## Amendment (2026-10-06): a deeplink is exchanged only for a login this app started

### Threat

The renderer used to exchange the `code` of any `chatic://oauth?provider=&code=` deeplink it
received. The `chatic:` protocol is registered with the operating system, so any web page,
document or app on the machine can open such a link. A link carrying a code the attacker obtained
for their own account signed the victim's app in as the attacker — login CSRF — and, because the
exchange replaces whatever session is on the device, it did so even when the victim was already
signed in. The victim keeps using the app, and what they write lands in the attacker's account.

### Decision

The deeplink is no longer enough on its own. `start` writes a **start record** — provider, start
time and a random nonce — to the app's persistent storage before it opens the system browser.
Persistent, because a login often ends with the app having quit and the deeplink relaunching it.
When a deeplink arrives (or the hand-off page lands inside the shell), the record is read and
deleted in one step, and the code is exchanged only if all of these hold:

1. a record exists;
2. it is younger than ten minutes;
3. its provider is the deeplink's provider;
4. if the deeplink carries a nonce, it equals the record's.

Otherwise nothing is exchanged, the reason is logged, and the person sees a message saying the
link was ignored (or that the login expired). The record is deleted whether the deeplink is
accepted, refused or expired, so a link is good once. The deeplink parser is strict as well: it
compares the parsed scheme and host rather than a string prefix, and an unknown or missing
provider is a malformed link instead of defaulting to `google`.

A Guest Session linking to Google from the Profile page started its login in the app, so it has a
record and works as before.

### Remaining risk

The window is closed, not the hole. An attacker who gets the victim to open the link **within the
ten minutes after the victim really started a login** still passes: there is a record, the
provider matches, and no nonce was required. The nonce is generated and stored but is **not sent
to the relay**, because the OAuth Relay is outside this repository and nobody has confirmed that a
value riding the `redirect` address comes back to the hand-off page. A deeplink that does carry a
nonce is already held to the record's, and `buildAuthorizeUrl` can send one. The risk closes when
three things happen together once the round trip is confirmed with a real login: `start` passes
the nonce to `buildAuthorizeUrl`, the hand-off page forwards it into the deeplink, and the check
treats a missing nonce as a refusal. Until then the first two are inert and the third would break
every login.

### Consequences

- Two links opened close together can cost the person a login: the first consumes the record and
  the second finds none. They start again.
- The ten-minute window and the record's storage key are one constant each, in
  `features/auth/utils/oauthLoginStart.ts`.
- Nothing changes in the Desktop Shell, so no shell release is needed.
