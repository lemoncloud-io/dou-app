# 0178. Desktop Google sign-in returns by deeplink with a relay code, and the app holds no client secret

Date: 2026-10-07

## Status

Accepted. Builds on [ADR-0009](./0009-desktop-social-login-via-system-browser-deeplink.md) (system browser, hand-off page, protocol deeplink) and closes the part of the risk its amendment left open that a link opened on the machine inside the ten-minute window passes. The part about another app claiming the protocol scheme stays open and is recorded below.

## Context

Desktop Google sign-in has to get the person's result back into the app after the consent screen in the system browser. We tried to let the app get Google's token itself, the way Google recommends for desktop applications: a loopback redirect on `127.0.0.1` with PKCE and a Desktop-type OAuth client. Consent and the return of the authorization code worked. The token exchange without a client secret was refused — `400 invalid_request`, "client_secret is missing." So that route needs a client secret inside a binary we hand to everyone, which is not a secret.

Two things were also wrong on the route we kept:

- The hand-off page opened `chatic://` on the dev channel. The scheme was read from a build variable that no deployment sets, so it always fell back to the production scheme, while the dev shell registers `chatic-dev`.
- The amendment to ADR-0009 left a window: the start record's nonce was never sent to the relay, so a link without a nonce was accepted for ten minutes after any real start.

## Decision

Keep the browser hand-off. The link that comes back to the app carries a relay code and the nonce this app sent with the start — never a provider token, never a session.

The app exchanges the code only when all of these hold:

1. a start record exists;
2. it is younger than ten minutes;
3. its provider is the link's provider;
4. the link carries a nonce, and it equals the record's.

A link without a nonce is refused, with the same message as any other link the app did not start. The record is used up whatever the verdict. The nonce rides the relay's `redirect` address when the login starts and is forwarded by the hand-off page into the deeplink; a hand-off page that arrives without one stops with a failure screen instead of opening the app.

The scheme the hand-off page opens follows the stage — `chatic-dev` on local and dev builds, `chatic` on production — which is the axis the shell picks its own scheme by (the dev channel registers `chatic-dev`, the production channel `chatic`). It is a registry rule, so no deployment setting is involved.

## Considered

- **Embedding the client secret as a build value.** Extractable from the binary, and it also needs a shell release and a new token audience on the backend.
- **Loopback redirect without a secret.** Measured, refused by Google as above.
- **Having the relay hand back the provider token.** A token would then cross an operating-system-wide scheme, where any app that claims the scheme could read it.
- **Sending the nonce first and requiring it later.** It leaves a state where the nonce is sent but not trusted, and needs one more change to close the window. Requiring it now costs only that sign-in on dev is visibly broken until the relay's round trip is confirmed, and it is cheap to undo (one check).

## Consequences

- No shell release — it deploys with the web.
- The nonce has to survive the relay's round trip. If the relay drops it, or mangles the `redirect` address, every sign-in stops at the hand-off page with a failure, visibly, rather than passing unchecked. A real sign-in on the packaged dev app (macOS) showed the relay returning it.
- A sign-in started just before a web deploy by the old bundle carries no nonce and is refused once; the person starts again.
- A link opened during a real sign-in can still spoil that sign-in (the record is used up) but cannot complete one.
- What this does not stop: an app on the same machine that claims the protocol scheme receives the code, and nothing in this repository keeps it from exchanging that code itself — the nonce never reaches the server, so it proves nothing to a party that never needed it. Nothing here bounds that: this repository does not show that the relay refuses a code that was already exchanged, so the app does not rely on it. Closing it needs the relay to use a code up on its first exchange and to bind it to a challenge sent at the start. It is accepted while Google sign-in is dev-only.
- This repository does not show that the server refuses a code exchange signed by a different device than the one that started the login; the record exists only on the installation that started it, and nothing stronger is claimed.
- Social sign-in stays off in production. Turning it on waits for the scheme-claim decision above, for invited cloud memberships following the account, and for a real sign-in confirming the same user as on mobile.
