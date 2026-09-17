# session

**The settings screen, and the two logout actions it is the only place to trigger.** Where
[overlay/](../overlay/README.md) is read-only state inspection, this is where a session actually
changes: moving to the login screen, or logging out at one of two different scopes. Screen code:
`apps/testbed/src/app/pages/SettingsPage.tsx`.

## What the screen shows

- A button to the login screen ([login.md](./login.md)), reachable from either a guest or a
  cloud-authenticated state.
- A summary of the current session: relay login state, cloud login state, the active cloud id, the
  active place id.
- The two logout actions below.

## Cloud logout vs. relay logout

These are not interchangeable, and the screen has to keep the distinction visible in its copy —
relay logout is the superset.

**Cloud logout** — `useLogoutCloudSession().logoutCloudSession()`
([`useLogoutCloudSession.ts`](../../../../libs/app-runtime/src/session/hooks/session/actions/useLogoutCloudSession.ts)).
Ends only the current cloud session; the relay session is untouched. Internally this clears the
cloud slot, which flips `cloud.isActive` to `false`; `resolveActiveServerContext`
([`contextStore.ts`](../../../../libs/app-runtime/src/session/store/contextStore.ts)) reads that flag
and switches `activeServer.kind` back to `'relay'` on its own — nothing on this screen has to drive
that transition explicitly. Chat home reacts to the same signal: it discards the cloud-scoped
place/channel lists and re-queries under the relay (`default`) context (see
[../chat/README.md](../chat/README.md#cloud-switching)).

**Relay logout** — ends the broker session itself. Cloud state is cleared along with it (a cloud
session cannot outlive the relay session it was issued under). The moment relay auth is gone,
`RuntimeConnectionHost` notices and signs back in as a guest immediately — see
[the app README](../../README.md#global-rules-every-screen-follows). So a relay logout is never a
resting "logged out" state on this screen; it settles back into the guest/`default`-cloud state
within the same tick.

## Verifying

- After a cloud logout, `activeServer.kind` should read `'relay'` and the relay session should still
  be present.
- After a relay logout, cloud state should clear and a fresh guest session should appear
  immediately — no login screen in between.
- The summary on this screen should agree with [overlay/README.md](../overlay/README.md)'s session
  panel at all times; if they diverge, one of the two is reading a stale source.

## Documents

- [login.md](./login.md) — the explicit email-login screen
- [invite.md](./invite.md) — invite creation and accept
