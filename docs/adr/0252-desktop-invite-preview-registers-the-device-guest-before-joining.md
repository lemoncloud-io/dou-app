# ADR-0252: Desktop invite preview registers the device guest before the person joins

> Status: Accepted · Decided: 2026-10-29 · Implemented: `feat/desktop-invite-onboarding`
> · Scope: `apps/desktop-web/src/app/features/auth/`

## Context

Desktop's invite page used to take a pasted link and join in one step. A person saw which place they
had joined only after the exchange had already run, and a link that was expired or already used showed
up as a server sentence on a screen that gave no sign of progress.

Showing the place and the inviter first needs the invite's details, and the only way to read them is
the signed lookup (`fetchInviteCodeInfo`), which is signed with a guest `delegatorId`. A signed-out
device has none, so the lookup cannot run until a device guest session exists. There is no
unauthenticated lookup, and this change does not add one: it is a backend change and out of scope.

## Decision

**The preview step registers the device guest if there is none, then reads the invite without
consuming it.** The exchange is a separate, later step the person confirms.

- A failed lookup, or an invite whose state is `accepted`, `expired`, `canceled` or `rejected`, stops at the preview. Any other state, or none, is read as pending. This differs from
  the one-step login, which logs a failed lookup and goes on.
- A guest the preview registered is remembered. Leaving the page signs it out; a session that existed
  before the page opened is left alone.
- The guest is registered before the person has agreed to join anything. That is the cost of the
  decision, and the two rules above are what keep it from leaking into the app.

## Consequences

- **Looking at an invite creates a device guest even if the person never joins.** The device id is
  fixed per install, so it is the same guest every time, not a new account per look. Backing out signs
  it out. Quitting or reloading the app during the preview does not: the page state, including the
  note that the preview registered the guest, is in memory only, so the next start finds a guest
  session and opens the app as that guest. Persisting the note to clean up on the next start was
  considered and left out as more machinery than this flow justifies.
- **A bare `invt:` code cannot be previewed.** It names no backend to look up, so it joins without
  details. A pasted string that is not a link is also read as a bare code today, so it passes the
  preview and fails at the exchange.
- **Whether an expired invite is rejected by the lookup or reported through its state is read both
  ways.** Either blocks the preview.
- **If an unauthenticated lookup ever exists, the guest registration can move to the join step** and
  looking at an invite would create nothing.
