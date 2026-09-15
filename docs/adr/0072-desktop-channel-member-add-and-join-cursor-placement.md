# ADR-0072: Add desktop channel members with a single "add directly" flow scoped to shared channels, and take the read cursor out of the global user record

> Status: Accepted · Decided: 2026-08-28
> Related: [ADR-0022](./0022-channel-invite-page-web-ui-kit.md) (apps/web invitations — batch contact invites, invite links. **A different thing from this ADR**) · [ADR-0015](./0015-channel-settings-ui-refresh.md) (channel settings, turning kick into `leaveChannel`) · [ADR-0048](./0048-unread-count-derivation-contract.md) (unread derivation contract — shares the premise that the join cache is home to the read cursor)

## Context

### The requirement

On desktop, add someone who is **already in another channel with me** to this channel. The
starting assumption was "generate an invite link from a userId."

### What already exists

| Area               | Existing asset                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct-add API     | `ChannelRepository.inviteChannel` → `ChannelRemoteDataSource.inviteChannel` → `gateway.invite`. `ChatInviteInput = { channelId, userIds[] }`. The round trip to the engine already works |
| App wrapper        | `inviteChannel` in [`useChannelMutations.ts`](../../apps/desktop-web/src/app/shared/hooks/useChannelMutations.ts); apps/web has the equivalent                                           |
| Member list        | [`useChannelMembers.ts`](../../apps/desktop-web/src/app/features/channels/hooks/useChannelMembers.ts) — observes the user cache filtered by `channelIds`                                 |
| Phone-relay invite | `InviteDialog` + `useCreateInvite` → `user.invite-batch`. Builds a link to send to someone without an account                                                                            |

### Gaps

1. **No UI called the direct-add API at all.** Across the whole repo, only the two wrapper files
   above ever called `inviteChannel(`.
2. **The only invite button lived behind `import.meta.env.DEV`.** Production builds had no path at
   all for putting someone into a channel.
3. **`inviteChannel` was the only mutation without an optimistic write.** Its sibling mutations
   (`createChannel`, `updateChannel`, `leaveChannel`) all apply locally then roll back; this one
   only used the server response. That breaks the project's mutation rule (the backend is
   eventually consistent, so a read right after a write is stale).

### Constraints

- **`channel.invite` adds immediately, it is not a link.** It puts a registered user in as a member
  right away with no acceptance step. A link would need a new server route.
- **There is no global cloud user directory.** `channel.list-user` is scoped per channel.
- **Whether `channel.invite` is owner-only has not been confirmed in server code** (unverified).

## Decision

### 1. Add, not invite — candidates are the union of members across my channels

`AddMembersDialog` provides search plus multi-select and adds people immediately with
`channel.invite`. No link, no acceptance step. Entry points are the channel settings panel and the
channel header menu.

The candidate pool has to be built client-side since there's no global directory
([`useInviteCandidates.ts`](../../apps/desktop-web/src/app/features/channels/hooks/useInviteCandidates.ts))
— read each of my channels' rosters, union them, then subtract the target channel's members and
myself.

- **There are two exclusion sources**: the roster read results **and** the channel record's
  `memberIds`. Even if a roster fetch fails, someone already in the channel won't show up as a
  candidate.
- **When the socket is unverified, the cache pool is served instead.** There is a path where the
  socket stays unverified indefinitely after sleep/wake
  ([`useChannels.ts`](../../apps/desktop-web/src/app/shared/hooks/useChannels.ts)), and waiting
  for it would pin the spinner forever. The network path runs again on the false→true edge.
- Mounted only while the dialog is open — the request count scales with the number of channels.

### 2. Make `inviteChannel` an optimistic write

Add the invited ids to `memberIds` **before** the round trip, and restore the pre-invite channel
record on failure (the same shape as `updateChannel`). Because the server response can omit the
member list, union in the invited ids so they don't get lost — the same defense `leaveChannel`
already uses for kicks.

The member list reads from the **user cache** (`channelIds`), but the invite response only touches
the **channel cache**, so on success the chosen record is written directly into the user cache
([`useAddMembers.ts`](../../apps/desktop-web/src/app/features/channels/hooks/useAddMembers.ts)).
Not a refetch. If this cache write fails, **an already-successful invite is not reported as a
failure.**

### 3. Take the per-channel read cursor out of the global user record

`toDomainUser` used to spread the roster response as-is onto `$join` — the read cursor _for the
channel that response covered_ — landing it on the user record. The user record is one row per
user id, and `channelIds` unions across channels into a **global record**, so whichever channel
was mapped last ended up owning that field.

Nobody reads that field — every consumer reads `channel.$join` instead, and the per-channel
cursor's real home is the **join cache**, keyed by `channelId@userId`. Even so, it couldn't just be
dropped: `UserRepository.refreshList` was already harvesting joins from **already-mapped** users.
Dropping it only in the mapper would kill join-cache hydration outright.

The harvest point moves to the raw view instead — `fetchUsers` returns `{ users, joins }` (the
shape `syncChannelUsers` already used), and `refreshList` consumes what it's given. Then
`toDomainUser` **only reads** `$join` (to derive `channelIds`) and no longer includes it in its
result.

As a result, **the ordering trick in the candidate hook — "fetch the target channel's roster
last" — became entirely unnecessary.** That ordering was a band-aid on top of a flat cache.

### 4. Phone-relay invite is deleted, not left behind a flag

The flow that builds a link for someone without an account is a different product from "add a
teammate to this channel," and it never shipped to production. `InviteDialog`, `useCreateInvite`,
`buildInviteLink`, the `'invite'` dialog kind, the two dev-gated buttons, and 9 i18n keys were all
deleted. There were no other callers. **Desktop no longer has a path to reach someone without an
account.** apps/web keeps its own invite flow intact (ADR-0022).

### 5. Owner gating is left to the server

Since we couldn't confirm whether `channel.invite` is owner-only, the button is not gated, and
server rejections surface as a toast instead. A failure that shows up in QA is better than a
guessed gate.

## Alternatives

- **Generate an invite link by userId** — the server has no such route. Not possible without a new
  spec.
- **Manual userId entry** — smaller to build, since the profile popover already copies an id.
  Chose picking from shared channels instead; pasting still works because the search box also
  matches by id.
- **Move candidate aggregation to the engine (`libs/data`)** — so apps/web could reuse it. There is
  no matching server endpoint, so **there is no source of truth to diverge from yet.** Move it the
  day a second client needs a picker.
- **Have `inviteChannel` own the user-cache write too** — the correct layering, but needs
  `IUserLocalDataSource` injected into the repository, which spreads into the DI factory and many
  existing tests. Separate work.
- **Leave `inviteChannel` non-optimistic and refetch** — violates the project's mutation rule.

## Consequences

**What is gained**

- Production desktop gets a channel-member-add path for the first time.
- `inviteChannel` follows the same rule as every other mutation.
- The user cache no longer carries per-channel state. If anyone reads `user.$join` in the future,
  there's no longer a trap where they get some arbitrary channel's cursor.

**What is accepted**

- Desktop cannot invite someone without an account.
- Opening the dialog fires one `refreshList` per channel I belong to — **unmeasured.**
- User rows cached before this change keep carrying `$join`. `cacheWrite` is a spread merge, so it
  stays until overwritten. Harmless since nothing reads it, and the app side strips it defensively
  before writing.

## Still undecided

- Whether `channel.invite` is owner-only (unverified — needs server confirmation).
- Whether the fan-out holds up on accounts with a large number of channels.
