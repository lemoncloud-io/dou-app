# ADR-0273: The web exchanges a relay code from the shell the way desktop does

> Status: Accepted · Decided: 2026-11-02 · Implemented: `feat/shell-google-sign-in-via-relay` (the web
> side; the shell config moves to the relay preset once the core package ships it)
> · Scope: `libs/bridge-messages` (`OnOAuthLoginPayload`), `apps/web` (`LoginPage`, `useSocialLinks`)
> · Related: [ADR-0208](./0208-local-runs-default-to-a-virtual-mobile-shell.md) decision 7 (the shell's
> Google sign-in, a popup that hands back an ID token) ·
> [ADR-0178](./0178-desktop-google-sign-in-returns-by-deeplink-with-a-relay-code-and-no-client-secret.md)
> (desktop's relay code)
> · The module docs are [apps/web auth](../../apps/web/docs/feature/auth/README.md),
> [apps/web social-links.md](../../apps/web/docs/feature/account/social-links.md) and
> [apps/shell-adapter](../../apps/shell-adapter/README.md#sign-in)

## Context

The web asks its shell to sign in with `OAuthLogin` and receives the answer on `OnOAuthLogin`. Until
now the answer was always a provider token: the native apps sign in with the provider SDK, and the
virtual mobile shell imitates that with a Google Identity Services popup that returns an ID token for
the same client (ADR-0208 decision 7). The web sends the token to `verify-native-token`.

The popup depends on settings outside the repository: every shell origin has to be an authorised
JavaScript origin on the right Google client, and the client id is read from the mobile app's env
files. The core shell package is gaining a second sign-in preset that goes through the organisation's
OAuth relay instead, the same relay the desktop app signs in through. The relay keeps the provider's
token and hands back a short-lived code, so a shell on that preset has no ID token to give. Its
answer is `{ provider, platform, code }`.

The desktop app already exchanges exactly this code. It posts it to `verify-oauth-code`, signed with
the guest session already on the device, and the backend records that guest as the new session's link
— the same record the native sign-in leaves, and what later lets the account into the clouds the guest
was invited to.

## Decision

**A sign-in answer may carry a relay code instead of a token, and the web exchanges it the way desktop
does.**

- `OnOAuthLoginPayload.result` is `OAuthTokenResult | OAuthCodeResult | null`. `OAuthTokenResult`,
  which the native apps are typed to return, is unchanged; the code result is a type of its own, and
  its comment says only the virtual shell answers with it.
- The login screen tells the two apart by `code`. A code goes to
  `runtime.session.createCredentialsByProvider(provider, code, { linkCurrentSession: true })` — the
  call desktop makes — and a token keeps `loginRelaySocial`. Logging, leaving for `returnTo` and the
  failure toast are shared.
- Linking from the account hub forwards a code unchanged. `auth.link-account` takes
  `{ provider, code }` in place of a token, which is what desktop's Link Google sends, and the code
  holds for both `verify` and `confirm`.

## Consequences

- **The native contract does not move.** The native apps still return `OAuthTokenResult`, and nothing
  in them changes. A native app that started answering with a code would be exchanged too; the type
  comment is what says it should not.
- **The exchange needs a device session.** `verify-oauth-code` answers 403 without one. The web inside
  the shell boots as a guest, so it has one; if it ever does not, the screen shows its usual failure
  toast rather than a new state.
- **The shell can switch presets without a web change.** The web reads what comes back, not which
  preset the shell runs, so moving the shell config to the relay preset is a config change once the
  core package releases it.
- **One more path to keep working.** The login screen's unit tests and the e2e suite's `oauth-login`
  spec each cover the code answer beside the token answer.

## Alternatives considered

- **The shell exchanges the code itself and hands the web a session.** Rejected: the guest session the
  exchange must be signed with lives in the web, and no shell hands the web a session today — the web
  would be entered by a path the app never takes.
- **A separate message for the code.** Rejected: the login screen subscribes to one channel for every
  outcome of a sign-in, and a second one would need its own pending state and its own failure path
  for the same outcome.
- **Exchange without linking the session** (`/oauth/{provider}/token`, the admin path). Rejected: the
  guest would not be linked to the account, so a sign-in in the shell would lose the clouds the guest
  was invited to — unlike the native sign-in it stands in for.
- **Keep the popup only.** The web would need no change, but the shell would stay tied to Google
  client settings per origin. Accepting a code costs one branch in the web and keeps the token path as
  it is.
