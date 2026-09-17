# ADR-0035: Entering the room after a relay 1:1 invite is accepted — `channelId` first, then a re-fetch, then the list fallback

> Status: Accepted · Decided: 2026-07-30

## Context

For the relay-server 1:1 invite feature built and integrated by ADR-0089/0034, we checked whether "the
process after an invite is accepted really does split between the relay server and the cloud server".

**The split itself is fine.** `InviteDialog` routes on the deep link's `relay` marker
(`apps/web/src/app/features/home/components/InviteDialog.tsx:33`), and session handling splits as
intended — a relay accept only refreshes the relay socket slot and keeps the cloud session
(`libs/app-runtime/src/socket/auth/applySessionToken.ts`), while a cloud accept goes through
`/oauth/login-invite` (`libs/web-core/src/api/auth.ts:208`) → `switchCloudSession` to rebuild the cloud
slot.

The problem is what comes next: **the step where "the accept succeeded but we still have to get into
the newly created room"**.

### The backend contract (confirmed from docs and types)

The docs state when the room is created (`chatic-sockets-api/docs/specs/relay-server-invite/05-client-guide.md`):

- `:58` — "An invite **only creates a code.** The room is created the moment it is accepted."
- `:222` — "**The room is not in the response.** It is created asynchronously, so wait for the channel
  list to refresh or **fetch it again.**"
- `:301` (the not-yet-implemented section) — "The room id in the accept response — after accepting, the
  channel and join creation events arrive over the websocket."
- `:257` — "Inviting the same number again is the same person. … **If a room already exists, it
  continues into that room.**" → in the re-invite case there is no asynchronous creation to wait for at
  all.

And **a field to hold the room id already exists in the backend model**:

- `InviteModel.channelId` — the comment reads **"the dm room created by accepting"**
  (`@lemoncloud/chatic-backend-api/dist/modules/auth/model.d.ts:295-296`)
- `MyInviteView.channelId` — "the channel this code lets you into" (`dist/view/types.d.ts:110-111`).
  `siteId`/`site$` ride along with it.

So the field is designed. What remains is whether the backend fills it at accept time. The spec's Out
of Scope ("recovering the dm room `channelId` — not implemented in backend", `01-spec.md:73`) describes
the state as of 2026-07-29.

### Where the client stands

- **It never reads `accepted.channelId` at all.**
  `apps/web/src/app/features/home/hooks/useRelayInviteFlow.ts:183-197` merges the accept response into
  `setInvite` and then goes straight to `enterChannel()`. The cloud path, by contrast, does read the
  same field (`apps/web/src/app/features/home/hooks/useEnterInvitedChannel.ts:21`).
- **Of the two remedies the docs offer, it does only one.** Only "wait for the list to refresh" is
  implemented (`apps/web/src/app/hooks/useAwaitInviteChannel.ts` — a 3-second `syncChannels` poll plus
  shape matching, with a 20-second timeout). **There is no "fetch it again" (`invite.get` re-fetch)
  path.**
- As a result, even in cases where the room id is knowable immediately — such as a re-invite reusing an
  existing room — we wait at least one poll round trip, and if creation takes more than 20 seconds we
  fall back to home.

### Hypotheses rejected during the investigation (recorded so they are not reopened)

- **The `item.sid === selectedSiteId` filter in `useAwaitInviteChannel` could be off** — **not true.**
  Relay has exactly one place, and the creation path is blocked twice over:
  `canAddPlace = isCloudOwner && permissions.canCreatePlace` (`HomePage.tsx:64-71`), `canCreatePlace`
  requires `isCloudActive` (`useUserPermissions.ts:27-31`), which is only true when
  `selectedCloudId !== 'default'` (`libs/web-core/src/session/services.ts:454`). Relay has
  `cid === 'default'`, so both conditions are false. `apps/web/docs/feature/home/README.md:51-52` also
  states "relay has one default place and no Add place". As supporting evidence, `syncChannels` drops
  rows without `$.sid` (`libs/data/src/repositories/ChannelRepository.ts:169-171`), yet DM rooms show
  up correctly on the relay home, so relay channels do carry the default place's `sid`. **The filter
  stays.**
- **The client composes the DM `channelId` itself** — not possible today. `buildChannelId`
  (`chatic-sockets-api/src/lib/channel/shared.ts:72`) is deterministic only for `self`
  (`self:${ownerId}`); everything else is `$U.uuid()`, and the comment states that "a canonical id for
  `dm` is out of scope for P1". On top of that, the party that creates the DM on accept is not relay
  but backend-api (relay's `accept-invite.ts` is a pass-through).

## Decision

**Change entering the room after accept into a three-stage resolution.** If the value is already in
hand, do not wait; only when it is missing, step down to progressively broader means.

1. **Stage 1 — read the accept response directly.** If the `acceptInvite` response carries a
   `channelId`, `setPendingChannel` with it and enter immediately. No waiting. This matches the idiom
   of the cloud path (`useEnterInvitedChannel.ts:21`).
2. **Stage 2 — re-fetch `invite.get`.** When stage 1 is empty, re-fetch `invite.get(code)` at short
   intervals to see whether `channelId` gets filled in. This is the method the docs
   (`05-client-guide.md:222`) explicitly recommend, and `invite.get` is already wired up for step
   re-validation, so no new API is needed. **The cadence is fixed at `[0, 1500]`ms — once immediately
   plus once 1.5 seconds later** (reduced from three probes during implementation review). The delay
   sits in front of the probes, so more probes means a later answer and a correspondingly later start
   for the more robust stage 3 — and stage 3 looks at the real channel row and has its own 3-second
   poll, so a third probe adds almost nothing.
3. **Stage 3 — keep the existing list fallback.** When stage 2 is also empty, use the current
   `useAwaitInviteChannel` (the `syncChannels` poll + `stereo==='dm'` shape matching + 20-second
   timeout) unchanged. The move-to-home plus "it will arrive shortly" toast on timeout stays too.

**Supporting decisions**

4. **The `sid` filter is not touched** (see the rejected hypotheses above).
5. **The backend request is corrected to "please fill the field in".** In the roadmap
   (docs/plans/relay-dm-invite-parallel-roadmap.md, which lived in the root docs tree, since removed),
   backend request 5 is made concrete: not "extend the contract" but "fill the existing
   `InviteModel.channelId` at accept time". Stages 1 and 2 get faster automatically, **with no client
   deploy**, the moment that request lands.
6. **The websocket push fast path is out of scope this time.** It is left as a follow-up (see
   Consequences below).

## Alternatives

- **Keep things as they are (polling only).** There is no correctness bug in the current behaviour — in
  fact this investigation found no bug. But it never reads a value it might already hold, always waits
  at least one round trip, and is especially wasteful in the re-invite case (reusing an existing room).
  Adding stage 1 costs almost nothing, so this is dropped.
- **Ask the backend to make the DM `channelId` deterministic (a composed id).** If it happened it would
  be the cleanest — `useAwaitInviteChannel` would become deletable outright. But `buildChannelId`
  explicitly excludes this as "out of scope for P1" and the creating party is backend-api, so the scope
  is wide. **Left as a follow-up**, with the three-stage structure — which holds until then — going in
  first. If request 5 lands first, most of this alternative's value disappears.
- **Replace the polling with a `getSocketManager().onType('channel.sync')` push fast path.** The hook
  point already exists and nobody uses it (`libs/app-runtime/src/socket/SocketManager.ts:310`,
  `libs/app-runtime/src/index.ts:60`). But it is unverified whether the backend actually emits to the
  accepting side (`emitSync` has no production caller, and the spec has a "not implemented" section),
  and replacing the polling without that verification carries a high regression risk. Excluded this
  time.
- **Always re-fetch `invite.get` right after accepting (stage 2 only, no stage 1).** This creates an
  unnecessary round trip in the cases where stage 1 works. Stage 1 is free, so this is dropped.

## Consequences

- What is gained:
    - If the backend is already filling `channelId`, or starts to, entering the room happens
      immediately after accept **with no client deploy**.
    - The re-invite case (reusing an existing room) already has a room, so it is likely to resolve
      right at stage 1 or 2.
    - The "fetch it again" path the docs recommend is implemented for the first time.
    - Watching whether stages 1 and 2 get a value on the dev stage immediately settles whether "not
      implemented in backend" is still true — it becomes the evidence behind backend request 5.
- What is accepted:
    - Three resolution paths mean more branches. Each stage's success and failure has to be pinned down
      by tests.
    - The stage 2 re-fetch adds socket round trips — only when stage 1 is empty, and at most twice. The
      worst-case delay is that stage 3 starts **1.5 seconds** later (20s → 21.5s). The 20 seconds in
      stage 3 is itself an arbitrary safety net, so this was judged acceptable.
    - The 20-second timeout fallback in stage 3 stays as it is — the experience when room creation is
      slower than that does not improve.
- Follow-ups:
    1. The push fast path (`onType('channel.sync')`) — revisit once the backend emit is verified.
    2. DM `channelId` determinism (making it composable) — if it happens, delete
       `useAwaitInviteChannel`.
    3. Land the correction to backend request 5 (decision 5).
- When to reverse: if the backend starts putting `channelId` in the accept response **synchronously**
  (the revisit trigger in `01-spec.md:83`), drop stages 2 and 3 and keep only stage 1 — at which point
  it becomes exactly the cloud path.
- Related: [ADR-0089](0089-relay-dm-invite-and-auth-parallel-tracks.md) D10 (step order),
  [ADR-0034](0034-inviter-phone-verification-guest-gate-and-sheet.md),
  [ADR-0032](0032-dm-chat-room-screen.md) (the DM room screen), and the roadmap
  docs/plans/relay-dm-invite-parallel-roadmap.md, which lived in the root docs tree, since removed.
