# 0192. Desktop sign-in opens in production, with the scheme-claim risk accepted

Date: 2026-10-13

## Status

Accepted. Amends [ADR-0178](./0178-desktop-google-sign-in-returns-by-deeplink-with-a-relay-code-and-no-client-secret.md),
which kept Google sign-in to the dev channel until the decision recorded here was made.

## Context

Desktop had two sign-in methods for an existing account, Google through the system browser and a
phone number with a texted code, and both were behind registry keys that were off in production
(`feature.auth.socialLogin` and `feature.auth.phoneLogin`, `byStage: { PROD: false }`). With both off,
a production desktop could reach an existing account only through an invite code.

ADR-0178 named three things Google waited on:

- **A guest invited to a cloud keeps it after signing in.** The desktop exchange now goes through the
  relay endpoint that records the guest session as the new session's link, the same record a mobile
  sign-in leaves. On the dev channel a guest who joined a cloud by invite signed in with Google and
  could still enter the cloud after a reload.
- **The account is the same user as on mobile.** On the dev channel a Google account linked on mobile
  to a phone-number account signed into that account on desktop.
- **Another app claiming the protocol scheme.** The operating system hands `chatic://` to one app. If
  another app on the machine is that app, it receives the one-time code and can exchange it itself:
  the nonce is checked only inside DoU and never reaches the relay, so it does not stop a party that
  does not need it. Closing this needs the relay to accept a code once and only from the party that
  started the sign-in, by a challenge sent at the start and checked at the exchange. That is server
  work with no date.

Phone sign-in was held for the first of these, the invited-cloud question. On the dev channel a
guest who joined a cloud by invite signed into an existing account by phone and could still enter
the cloud after a reload.

## Decision

1. **Both keys are on in every build.** The `byStage: { PROD: false }` rule is removed from each;
   the keys stay, with their `server` lane, so the gate is a registry value rather than a constant.
2. **The scheme-claim risk is accepted.** Google sign-in ships to production with it open. The relay
   change above is what closes it, and is requested from the server side.

## Alternatives

- **Phone first, Google after the relay change.** It removes the open risk, but leaves anyone who
  signed up on mobile with Google without a way into their account on desktop for an unknown time.
- **Wait for both.** Production desktop stays on invite codes alone.

## Consequences

- An app on the same machine that claims `chatic://` can take a Google sign-in's code and sign in as
  that person. Nothing in the app bounds this; the relay change does.
- An invited cloud follows the guest session that signed in, not the account for good: the same
  account signed in later from a fresh guest did not list it. This is the server's link record, which
  the mobile sign-in leaves too, and is not changed here.
- Rolling either back is a one-line registry change and a web deploy. A server-written value would
  do it without a deploy, but no remote fetcher is wired behind the `server` lane yet.
