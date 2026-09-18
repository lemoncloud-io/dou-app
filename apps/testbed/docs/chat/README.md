# chat

**Chat home: the cloud/place/channel picker, and the transition rules that make picking one behave
like the real app.** Not a flat data-listing page — every selection here drives an actual session or
site switch through `app-runtime`, and the point of this screen is to verify those transitions, not
just to render lists. Screen code: `apps/testbed/src/app/pages/ChatHomePage.tsx`.

## Everything here reads through `activeServer`

Every list on this screen — clouds, places, channels — is scoped by the current
`activeServer` (`runtime.session.useGlobalSession()`, type in
[`../../../../libs/app-runtime/src/session/store/contextStore.ts`](../../../../libs/app-runtime/src/session/store/contextStore.ts)):

- `activeServer.kind === 'relay'` → query under the relay context (`cid: 'default'`).
- `activeServer.kind === 'cloud'` → query under `activeServer.cloudId`.

A change in `activeServer` discards whatever the lists currently hold and re-queries from scratch —
nothing here waits to reconcile a stale result against a new context.

When there is no active site session yet, the channel list shows why instead of sitting empty:
_"This channel hasn't loaded because there's no site session yet — pick a cloud and a site above
first."_

## Layout

- **Clouds**, split into two sections: **My clouds** (the relay-backed `default` cloud plus any
  cloud actually owned through the broker) and **Invited clouds** (reached through
  [../session/invite.md](../session/invite.md), never delegable — see below).
- **Places**, scoped to the active cloud.
- **Channels**, scoped to the active place — name, last-message preview, last-message time.

## Cloud switching

Every cloud row, including the default one, calls the same handler
(`handleCloudClick`) — the branch is entirely in what clicking the **default** cloud does.

- **Clicking any non-default cloud** starts or resumes that cloud's session, and once authenticated
  the place list is re-queried under it.
- **Clicking the default cloud while a cloud session is active** calls
  `logoutCloudSession()` — see [../session/README.md](../session/README.md) for what that does and
  does not clear. `activeServer` flips back to `'relay'` on its own once the cloud slot clears, and
  this screen's lists follow it: whatever the cloud session was showing is discarded and place/channel
  come back under `default`. There is no separate "leave this cloud" action; logging out **is** the
  return path.
- **Invited clouds enter through the identical `handleCloudClick`/`switchCloud` path** as an owned
  cloud. The one thing that makes them "invited" rather than "owned" is how they got into the cache —
  see [../session/invite.md](../session/invite.md) — not a different runtime path once they're there.

## Empty states

- No places under the active cloud: _"There are no sites you can reach on this cloud."_
- A place is selected but not yet authenticated, so channels can't load: the "no site session yet"
  copy above, distinct from "no places at all."

## Documents

- [room.md](./room.md) — the chat room screen a channel opens into
- [manage.md](./manage.md) — creating and renaming places/channels from this screen
