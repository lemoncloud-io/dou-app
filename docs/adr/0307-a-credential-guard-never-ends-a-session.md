# ADR-0307: A credential guard never ends a session

> Status: Accepted · Decided: 2026-11-11 · Implemented: `refactor/credential-guards`
> · Scope: `libs/runtime-core/src/session/relayCredentialGuard.ts` (`SessionStalenessPolicy` loses
> `onTeardown`, `consecutiveFailureLimit` and `missingSessionCountsAsFailure`; the failure streak goes);
> `apps/web` and `apps/desktop-web` (`useRelayCredentialRefresh` stops passing
> `consecutiveFailureLimit: null`); the policy specs of `apps/web`, `apps/desktop-web` and `apps/admin`
> · Amends: [ADR-0076](./0076-app-runtime-auth-single-verdict-and-typed-session-events.md) — the
> teardown streak it describes, and Decision 7's move of admin's guard teardown to the strong logout
> · The behaviour is documented in [libs/runtime-core docs/session](../../libs/runtime-core/docs/session/README.md#the-credential-guards)

## Context

The relay credential guard probes whether the relay's HTTP signing credential has lapsed and asks the
socket to refresh it. It used to take a teardown policy as well: a callback, a number of consecutive
failures after which to call it, and whether a missing session counted as one. ADR-0076 described it
that way — admin logged out after three failures — and its Decision 7 pointed admin's teardown at the
logout that notifies the sockets.

Admin stopped using it in September. "The refresh did not run" turned out to be a statement about the
socket, not the session: after a laptop sleep the SDK needs 40–80 s to notice a half-open socket and
reconnect, and until then no refresh can travel, so three 30-second ticks logged admins out of live
sessions. The guard learned to skip failures a socket could not have carried, and admin dropped the
teardown altogether; the server's own refusal (`authFailureReaction`) and the relay renewer's
terminal-expiry window — which confirms an expiry, with the browser online, before it logs anyone out
— were already the paths that end a session. apps/web and apps/desktop-web had never torn down. No
caller used the option, but it stayed, and ADR-0076 still read as if a guard could end a session.

## Decision

**A credential guard keeps credentials fresh and never ends a session.** The relay guard has no
teardown option and keeps no failure streak. A refresh that did not run is logged, with why — a socket
that could not carry it, or a refusal from one that could — and the next trigger tries again. The
cloud guard already worked this way: a failed cloud renewal is a warning, and `onAuthExpired` owns
giving up on a cloud.

Ending a session belongs to two places, both outside the guards: the server refusing the session, and
the relay renewer's terminal-expiry window.

## Alternatives

- **Keep the option, unused.** A capability nobody passes is one a future caller turns back on without
  the history: the wake-from-sleep logouts are the cost of it, and a guard that cannot end a session
  cannot repeat them.
- **Keep it and count only failures a socket could have carried.** That is what the guard did last; it
  was still a second, speculative logout engine beside the two that know.

## Consequences

- `SessionStalenessPolicy` is `enabled`, `intervalMs`, `checkOnVisible`, `checkOnRelayVerified` and
  `forceRefresh`. A caller that passes a removed field no longer compiles.
- The relay guard's log line for a refresh a socket could not carry reads "left to the renewer" (it
  read "not counted").
- A console that wants a dead session to land on the login screen gets it from the server's refusal or
  the renewer's window, as admin already does.
