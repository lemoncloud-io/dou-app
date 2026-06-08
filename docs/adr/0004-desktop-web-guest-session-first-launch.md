# Desktop Web boots into a Guest Session, not an invite gate

## Status

accepted

## Context

`apps/desktop-web` shipped invite-only: an unauthenticated launch is hard-redirected
to the invite-login page (`routes.tsx` catch-all → `/auth/login`), and `useInviteLogin`
is the _only_ caller of `registerDevice`. There is no way into the app without an Invite
Code. `apps/web` (mobile) behaves differently — a launch with no invite deeplink runs
`handleDeviceRegistration()` (device register → `saveSelectedCloudId('default')`), landing
the user in a **Default Cloud** with a **Self Channel** (`stereo: 'self'`) and no join
required. Desktop never establishes that guest/default tier, so it has no Self Channel.

## Decision

Make desktop-web reach mobile parity at the _destination_: a first launch ends in a
**Guest Session** on the **Default Cloud**, showing the **Self Channel**. Specifics
(resolved in a grilling session, see `CONTEXT.md` for the canonical terms):

- **First-run landing** (not silent auto-register): a minimal welcome offers "Start
  chatting" (→ `registerDevice` guest bootstrap) and "I have an invite". Parity of
  outcome, one tap of intent.
- **Invite is demoted** from the gate to an in-app action (manual paste of an Invite
  Code via the existing invite-login surface). No invite deeplink wiring this round.
- **Default mode rendering**: detect default mode via `cloudCore.getSelectedCloudId() ===
'default'`, force `sid: 'default'` so the Self Channel loads, and hide the place
  switcher (nothing to switch to). Kept in the desktop feature layer — the shared engine
  is untouched, matching how `apps/web` handles `'default'`.
- **Return path**: the Default Cloud is a _permanent_ "Home" entry in the cloud rail.
  Selecting it clears the delegation token (mirroring web's
  `CloudSessionSheet.handleSwitchToDefault`) — `selectCloud('default')` is **not** a valid
  engine path (it would call `issueCloudToken('default')` and fail).
- **Subscription deferred**: the email → provisioned-cloud flow stays mobile's job;
  desktop only joins _existing_ clouds via invite + `useAutoSelectCloud`.

## Considered Options

- **Full silent auto-register** (zero UI) — purest mobile parity, rejected for a clearer
  desktop first-run affordance.
- **Keep invite as the gate, add a "continue without invite" escape hatch** — smallest
  change, rejected: leaves the blocked-without-link problem essentially in place.
- **Engine-level synthetic default place** (shared lib returns a default Place for all
  clients) — conceptually cleaner, rejected for blast radius on mobile.

## Consequences

- Login durability already holds: the Electron shell selects the `localStorage` storage
  adapter (`isDesktopShell()` in `web-core/core/index.ts`), so guest/cloud tokens and
  `selectedCloudId` survive relaunch — no re-registration, no bounce to landing.
- A cloud session is **singular** (one delegation/cloud token at a time); multi-cloud
  membership is a list + re-issue-on-switch, not parallel sessions.
- Known wart to accept or fix later: place selection is cleared on every cloud switch
  (`useCloudSession.clearSelectedPlace`), so returning to a cloud loses its last place.
- Acceptance is the verification matrix from the grilling session (cold-boot guest,
  relaunch persistence, invite-join + relaunch, Home↔cloud round-trips, token-expiry
  fallback, guest relay-token expiry → logout, logout → landing).
