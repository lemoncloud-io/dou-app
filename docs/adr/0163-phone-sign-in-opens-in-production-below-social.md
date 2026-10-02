# ADR-0163: Phone sign-in opens in production, below social

> Status: Accepted · Decided: 2026-10-02 · Implemented: `feat/login-phone-sign-in-production`
> · Scope: `apps/web/src/app/features/mypage/pages/LoginPage.tsx`, `apps/web/public/locales/{en,ko}/translation.json`,
> `libs/config/src/registry/feature.ts`
> · Supersedes §9-a of [ADR-0042](./0042-account-linking-unified-path-migration.md) and amends §9's browser
> copy; the rest of §9 and §9-b stand
> · The module doc is [auth/phone-verification.md](../../apps/web/docs/feature/auth/phone-verification.md)

## Context

ADR-0042 §9 put phone sign-in on the MY login screen, below the social buttons, with the
account-split warning directly above it. §9-a then held it to development builds (`isDevBuild()`),
because a subscription attaches to a cloud and cloud ownership follows the social account: a user who
signed up with a number alone had nowhere for a paid membership to land.

Two things have changed the weight of that reason:

- **§9-b already refuses the purchase before the store opens** when `link$.social` is definitely
  `'absent'`. Once the profile has answered, the money-without-a-subscription failure §9-a feared is
  refused at the point of purchase. The window where the answer is still `'unknown'` goes through to
  the store by design and relies on the server's validation, as it already did for invite-made users.
- **Phone-only users exist in production anyway.** Accepting or issuing an invite has always made a
  guest into a phone-verified main user. The login screen was the only door kept shut.

Meanwhile the gate had a cost of its own: in a browser build social sign-in is unavailable (it needs
the native shell), so with phone hidden **a production browser could not sign in at all**.

## Decision

1. **Phone sign-in shows in every build**, in the app and in a browser. The build-stage condition is
   removed, not moved behind a runtime flag. The registry's `feature.auth.phoneLogin` key, declared for
   this gate but never read, goes with it — left in place it would state the opposite of this
   decision to whoever wires it next.
2. **§9's layout stands.** Social first, then the divider, the account-split warning, and the phone
   button — the warning is still the only defense against an unmergeable second account.
3. **A browser shows one warning line and no divider.** §9 had it say "social is in the app" and then
   "if you have an account, sign in with social in the app" — the second already says the first, and a
   divider above phone separated it from nothing.
4. **The mark above the buttons is the cloud character with the wordmark** (`BrandMark`), the same one
   the invite accept screen uses, instead of the wordmark alone.
5. **"Terms" and "Privacy Policy" link to the in-app policy pages.** They are pushed, so the policy
   page's back returns to this login entry with its `returnTo`. They are disabled while an OAuth round
   trip is open, like every other control here: the credential is delivered to this screen's
   subscriber, and leaving would drop a sign-in the user had already completed. The translation marks
   which words are links (`<terms>`, `<privacy>`), since they sit in a different place in each
   language — under a new key, `termsAgreementLinks`, for the reason in Consequences.

## Alternatives

- **Keep it gated until a phone-only account can own a cloud.** That is server work with no date, and
  until it lands the gate protects against a failure §9-b already prevents, while keeping browser
  production with no sign-in at all.
- **Open it behind a server-written config key, as a kill switch.** The config registry designs that
  lane for keys writable by the server, and `feature.auth.phoneLogin` was declared that way — but the
  lane ships empty, because no remote fetcher is wired behind it. Building one for one button is more
  machinery than the risk calls for. Rolling back is restoring one condition and shipping the web
  bundle, which needs no store release.
- **Link the policy words to the hosted policy URLs**, as the plan picker does. That leaves for the
  system browser in the middle of a sign-in. The in-app pages already exist under MY → policy and need
  neither the network nor the shell bridge.

## Consequences

- More phone-only accounts in production. They can use everything except subscribing; the purchase
  refuses before the store with a message that social linking is required.
- Someone who already has a social account and signs in by phone on a new device gets a second,
  separate user that cannot be merged. The inline warning remains the only thing between them and it.
- A production browser can sign in for the first time.
- The linked terms sentence is a new key, and the screen no longer reads `termsAgreement`,
  `mobileOnly` or `socialMobileOnly` — but all three stay in the locale files for now. A bundle already
  running in a WebView refetches `translation.json` once its cached copy expires. Rewriting
  `termsAgreement` with tags would make that bundle print them literally, and deleting the other two
  would show it their English fallbacks in Korean. They can go once no bundle from before this change
  is still running.
