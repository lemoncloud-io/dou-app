# invite — issuing a 1:1 invitation, and accepting one

**`apps/web/src/app/features/invite` owns both ends of a relay 1:1 invitation.** One person types a
name and a phone number, the app issues a relay invite and hands the deeplink to the SMS composer;
the other person opens that link, proves the number is theirs, and lands in a DM room that did not
exist a moment earlier.

It also issues the **place invite**: a cloud place's owner brings someone into the place with no
room ([place-invite.md](./place-invite.md)).

The two ends share almost nothing but the code shape, so each has its own document. This one holds
what both obey.

## Scope

**In**

- Issuing a relay invite (`invite.create`), handing the deeplink to SMS, and the waiting screen that
  watches for an acceptance.
- Retiring an invite: cancel, reject, reissue, and the local dismiss that hides a row the server
  will never clear.
- The `/invite/accept` route, which is the single destination for **every** invite link — relay and
  cloud alike.
- The relay acceptance orchestration: re-read, phone verification, place profile, accept, and the
  three-tier hunt for the room the accept creates.
- The cloud acceptance pipeline's order and its place-profile step (§ Cloud invites: the profile
  comes after the place).
- The place invite: the room invite's contact invite with no room, at `/invite/place/:placeId`, and
  the accept screen's `place` target kind.

**Out**

- **Group-room "add a friend"**, which uses a different packet (`user.invite`) and is bound to a
  channel — [channels](../channels/README.md).
- **The invite-code login itself** (`runtime.session.useInviteFlow`) — session entry, owned by
  `@chatic/app-runtime`.
- **Phone verification and country-aware number input.** The issue form and the accept flow both
  mount screens they do not own — [auth](../auth/README.md).
- **The 1:1 room itself**, including the "they left" footer that starts a re-invite —
  [channels](../channels/README.md).
- **The home list row** an in-flight invite renders as — [home](../home/README.md).
- **Where an invite row is stored and how it is read** — `invite.list` is cache-first, and the cache
  contract, including the `dismissedAt` field this feature writes, belongs to
  [`@chatic/data`](../../../../../libs/data/docs/repositories/README.md).

## Design rules

1. **An invite code is a credential.** It never reaches a log line, a query key, `localStorage`, or a
   route parameter. Routes are keyed by `invite.id`; the full `invt:<id>:<code>` is composed in the
   scope of the call that needs it (`composeInviteCode`) and discarded.
2. **Branch on the server's `state` and error code, never on message text.** The state union is five
   values — `pending`, `accepted`, `canceled`, `rejected`, `expired` — and a status comes from
   `getSocketErrorCode`. Substring matching on an error message is how a copy change becomes a
   routing bug.
3. **The same status means different things at different stages.** `resolveNotice(status, stage)`
   takes the stage for exactly this reason: a `400` reading an invite is a malformed code, a `400`
   accepting one is an expiry; a `409` accepting is "someone got there first", a `409` rejecting is
   "you already accepted it elsewhere".
4. **Final actions are idempotent, so the call succeeding is the verdict** — not the `state` that
   comes back. Cancel racing a reject returns `rejected`, and the old link is dead either way.
5. **Render the server's clock, never a hardcoded lifetime.** The countdown reads `expiredAt`. The
   app asks for `expiresDays: 1` when it creates an invite, but that number appears in no copy: if
   the server answers with something else, the screen follows the server.
6. **Gates render instead of the form, never on top of it.** An unmet precondition never leaves a
   submittable form underneath a dialog, not even for a frame.

`accept/types.ts` is the file whose name hides its importance: `parseInviteDeeplink`, `isInviteEntry`
and `isRelayInvite` decide whether a query string is an invitation at all and which lane it belongs
to. There is no `flags.ts` — the feature-flag file that once gated the unbuilt halves of this flow is
gone, along with every branch it protected.

## Every link ends at one route

Share links (`/s?code=…`), the landing page and the native converter all funnel into
`/?provider=invite&…`, and that address will keep arriving forever — it is baked into every
installed app build, and no store release changes it. `InviteEntryGate` catches it at the root of
**both** route sets and redirects to `/invite/accept` before home renders, so someone arriving on an
invitation never pays for the place list, channel list, unread aggregation and membership lookup
they are about to navigate away from. During first run, onboarding keeps the query instead.

**The absence of a backend address is itself the relay signal.** A relay link carries no address
because the relay server needs none, so `buildInviteEntryParams` detects that and always emits an
explicit `relay=1`. Everything downstream gates on the marker and never has to infer relay from a
missing `_backend`; `InviteAcceptPage` branches on it and does nothing else.

`/invite/accept` is registered in `commonRoutes`, so it renders in both auth states and sits outside
`UnifiedLayout`. Both halves matter. An invite deeplink routinely lands before the background guest
login finishes, and a private path would fall to the `*` catch-all and take the query string with
it. No shell means no home data hooks and no bottom nav — but it also means the page mounts
`useBackHandler` itself, since that normally arrives with the layout.

The sender's screens are ordinary private routes: the issue form (`/invite/contact`, which route
state also puts into re-invite mode), the waiting screen (`/invite/:inviteId/waiting`), and the place
invite with its link screen (`/invite/place/:placeId`, `…/link`).

## Leaving the accept screen, and opening the room

**Both lanes leave the accept screen the same way**, whatever the outcome: by the stack's deeplink
rule (`useStackNavigate('deeplink', ROUTES.home)`), which rewinds onto the entry underneath. On a
cold start that is home, because the shell loads home before the link arrives. On a warm start it
is the screen the reader was on — My, place settings, a thread — except a room: the link itself
arrived by the push rule, which replaced the open room, so the rewind lands on whatever was under
it. Replacing the accept screen with home instead would stack a second home over the one the shell
loaded, and back from it would look like it did nothing.

An accepted invite that resolved its room also stashes the id in `stores/usePendingInviteChannel`.
`hooks/useOpenPendingInviteChannel`, mounted in `UnifiedLayout`, opens the room on whatever screen
the rewind lands on, and enters it by the stack's **push** rule — the one a push tap into a room
follows:

| Landed on                               | Result                                          |
| --------------------------------------- | ----------------------------------------------- |
| home, at the bottom (cold start)        | `[home, room]` — back returns to home           |
| a screen the reader chose (My, a place) | the room stacks over it, and back returns there |
| another channel's settings or thread    | that channel's screens are put away first       |

Where the opener lives is what makes this work:

- **In the layout, not on a screen.** The landing can be any private screen. An opener on one of
  them would miss the others, and the id would wait in the store until that screen next mounted —
  then open the room out of nowhere. It sits in `app/hooks` rather than this feature because the
  layout may not import a feature.
- **Outside the accept screen.** `/invite/accept` is a common route outside `UnifiedLayout`, so the
  opener first runs on the landing itself. Its check against the accept path is a guard, not what
  makes it wait. The one gap this leaves is a landing outside the layout, which nothing produces
  today: push and deeplink handling live in the layout, and `/s` and `/i` redirect with `replace`.

The id is kept in sessionStorage, not only in memory. The shell reloads the WebView when the OS
kills its web process — easy to cause while the reader is in another app reading an SMS code — and
after that the entries behind the accept screen belong to a document that is gone. The rewind is
then a full page load, which would take an in-memory id with it.

## The documents

| Document                                           | What it covers                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [relay-invite-sender.md](./relay-invite-sender.md) | The issue form and its three gates, SMS hand-off, re-invite detection, the retire rules, the waiting screen, list rows |
| [relay-invite-accept.md](./relay-invite-accept.md) | The accept state machine, the notice mapping, the profile precondition, decline, and the three-tier room hunt          |
| [place-invite.md](./place-invite.md)               | The cloud place invite: the session-site rule and its gate, what the server does with no room, and what it leaves open |

## Cloud invites: the profile comes after the place

`CloudInviteAccept` runs `useInviteAccept`: log in with the code (which is the accept), enter the
cloud, switch into the invited site, then open the room. The place profile is asked for **between
the site switch and the room**, and only once the session is in the invited place.

**Which place.** An invite is issued with nothing but a `channelId`. The server does answer a room
invite with the room's `siteId` and `site$` (checked against the dev server), but the published
invite view does not declare `siteId` — only the stored model does — so the pipeline does not rely
on it alone. It takes, in order: the invite's `siteId`, its place card (`site$.id`), then the room itself —
one cloud-wide `channel.sync` and the room's row from the cache (`sid`). A cloud 1:1 belongs to no
place. When none of these names one, the invitee enters without the switch or the profile step and a
warning is logged; the step used to be skipped silently whenever `siteId` was absent.

**One accept at a time.** The screen shows the accept as in flight for the whole pipeline, profile
check included, and a second tap while it runs is ignored. The hooks' own pending flags leave gaps
between steps, and a tap in one of them ran the accept twice.

It cannot move earlier the way the relay lane's precondition does. The server stores a profile on
the site the session is on and ignores any site the request names, and before the accept the
invitee is not a member of the place, so the session cannot be there. Right after the switch is the
first moment the profile can be written, and the last before the invitee is seen in a room.

- **Skipped when a profile exists.** `isPlaceProfileAbsent` decides, and fails open: a read that
  fails lets the invitee in rather than holding them at the door.
- **Required, but not a trap.** The form has no way out until a save has failed once. Saved or
  skipped, leaving it continues into the room.
- **The accept is already committed.** Someone who quits on the form is a member with no name in
  that place. This flow does not recover that state; the missing-profile prompts elsewhere do (the
  room-settings nudge, and home's profile menu).

## Where the backend still has gaps

Both lanes are shaped around the same two absences, so they are stated once here:

- **No notification reaches the inviter** when an invite is accepted, rejected or canceled. The
  sender learns by re-asking `invite.list` — a background cadence on home, thirty seconds on the
  waiting screen. That is why the sender lane polls at all.
- **`invite.accept` may answer without a `channelId`.** The room is created asynchronously, and when
  the field is filled is a backend question. Both lanes therefore degrade instead of assuming: the
  recipient's three-tier resolver and the sender's `useAcceptedChannelSync` both end in "the room is
  on its way, check home" rather than an error.

A third limit is structural rather than missing work: `invite.list` is asked with `limit: 100` and
`InviteListInput` has no cursor, so there is no real paging. An invite outside that window is
invisible to re-invite detection, the list rows, the waiting screen and the reconcile pass alike.

## How to verify

```bash
npx tsc -b apps/web/tsconfig.json
npx jest --config apps/web/jest.config.js --testPathPatterns "features/invite|useRelayInvites|useSentInviteLog|useAwaitInviteChannel"
```

Both lanes reach into `libs/data` for the invite repository and its cache, so a change to the row
shape wants `npx jest --config libs/data/jest.config.js --testPathPatterns "Invite"` as well.

What no suite covers: the SMS composer hand-off and the deeplink round trip, both of which need the
native shell. Confirm those on a device with two accounts — issue, receive the SMS, open the link,
verify, accept, and check that both sides land in the same room.
