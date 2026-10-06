# ADR-0170: The session is switched back to the selected place

> Status: Accepted · Decided: 2026-10-06 · Implemented: `fix/place-selection-restore`
> · Scope: libs/app-runtime `socket/auth` (`alignSessionSite`, `renewCloudSession`, `sessionDelegate`,
> `bootstrapSocketConnection`, `switchSite`), `session/store` (`getCommittedSessionSiteId`), apps/web
> `features/invite` (`PlaceInvitePage`)
> · The module docs are [app-runtime auth](../../libs/app-runtime/docs/auth/README.md) and
> [apps/web invite/place-invite.md](../../apps/web/docs/feature/invite/place-invite.md)

## Context

A cloud session has two records of "which place am I in": the **selected place** the app stores and
the screen shows, and the **place the socket session is on**, which the server decides and the token
names (`$site.id`). Every place switch moves both together, and nothing else was meant to move either
— so nothing compared them.

The server moves the second one on its own. A cloud credential renewal re-issues tokens through
`delegate-cloud` without naming a place, and the server picks one: measured against the dev server, a
session on place `10005` was re-issued a token for `10012`, another place of the same cloud. The
renewal then re-registers the socket with it, and the session is on `10012` while the selection still
says `10005`. A reload keeps both, because a connect registers with the stored token and writes
nothing back. Renewal runs when a credential is about to lapse — about hourly, and on re-entering a
cloud.

From then on the screen names one place and the server acts on another. It was seen as a place invite
opened from one place being filed under another: the invite carries no site, so the server stamps the
session's. Profile writes and anything else the server files under "the session's place" go the same
way.

## Decision

### 1. The selection wins, and the session is switched back to it

After a token names a place other than the selected one, the runtime `auth.switch`es the session to
the selected place. The selection is what the user chose and what the screen shows; the server's pick
is a side effect of a renewal nobody asked a place of.

The check runs where a token's place first becomes visible: after a renewal re-registers, on every
token writeback, and each time a slot authenticates — the last one is what catches a mismatch carried
across a reload.

### 2. If the switch back fails, the selection follows the session

A failed switch leaves the session where the server put it, so the selection is moved there instead.
The screen then shows a place the user did not pick, but it shows the place every call acts on. Two
records that agree on the wrong place are recoverable by a tap; a screen that names one place and
acts on another invites people into a place the owner never saw.

### 3. Only the committed cloud, never the relay, never during a switch

A background slot has no selection to disagree with. The relay's token names a personal place
(`P…`) that is never the selected id, so comparing them would switch forever. A token written back
while a place switch is in flight may still name the place being left, which is not drift — the
switch already moves the session. One alignment runs at a time, because its own switch writes a token
back.

### 4. The place invite also asks the token before sending

`PlaceInvitePage` refused a send when the selection named another place. It now also refuses when the
session's real place (`getCommittedSessionSiteId()`) does, which covers the moment between a renewal
moving the session and decision 1 moving it back. A token that names no place does not refuse.

## Consequences

- A renewal that lands on another place costs one extra `auth.switch` round trip, right after the
  re-registration.
- The runtime logs a warning each time it switches back, so how often the server moves a session is
  visible in the report logs rather than inferred.
- `getCommittedSessionSiteId` is public, the place anything filed under "the session's place" should
  check.
- Not done: asking the server for the place at re-issue time. Neither `delegate-cloud` nor
  `exchange-token` takes one; if they ever do, decision 1 becomes a no-op rather than wrong.
