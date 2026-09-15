# ADR-0045: Store the default place in the relay scope only, add profile creation as the last step of place creation, and unify display avatars into one component

> Status: Accepted · Decided: 2026-08-06
> Follows: [ADR-0034](./0034-inviter-phone-verification-guest-gate-and-sheet.md) · [ADR-0036](./0036-data-surface-unification-app-runtime-cleanup.md) · [ADR-0039](./0039-dm-display-name-chain-and-invite-profile-release.md) · [ADR-0040](./0040-self-chat-title-and-profile-setup-nudge.md) · [ADR-0041](./0041-place-profile-as-invite-precondition.md)

## Context

On the place (= Site) track, three data layer defects, one gap in the flow, one display policy, and
one UI kit debt were found together. They are handled on one branch (worktree
`relay-default-place-avatar-ui`).

1. **The default place mixes into the cloud list.** `UserRepository.getMyProfile` writes the `$site`
   embedded in the profile into the place cache whatever the active context is
   (`libs/data/src/repositories/UserRepository.ts:114`). That write happens even while switched to a
   cloud (cid ≠ `default`), so the default place row stays in the cloud-scoped cache and shows up mixed
   into the home place list. `refreshList` only does `cacheWriteMany` and never deletes
   (`PlaceRepository.ts:84-91`), so once a row is polluted it does not go away on its own.

2. **The list does not reflect a creation right away.** `createPlace` only does a single-item
   `cacheWrite` (`PlaceRepository.ts:93-99`). The server order stamp (`order`) is only stamped by
   `refreshList`, so a single-item write does not guarantee list ordering or reflection.

3. **place.update dies with a 400.** The backend returns
   `@id (string) is required - place.update(-)`. The cause is the caller: `PlaceInfoPage` sends only
   `{ sid, name, thumbnail }` (`apps/web/src/app/features/place/pages/PlaceInfoPage.tsx:106-110`).
   With no `id`, the optimistic cache write in `PlaceRepository.updatePlace` (which is based on
   `payload.id`) is skipped along with it. In place, `id === sid`.

4. **There is no profile after creating a place.** The creation flow (`CreatePlaceDialog` →
   `createPlace` → `switchSite` → close) has no step for creating the place user profile (nickname and
   photo). Members who arrive by invite are forced through profile creation as a precondition by
   ADR-0041, so in practice the only entrant without a profile is the owner who created the place.

5. **The top of MyPage changes to the cloud profile.** `useMyUser` observes the user cache of the
   active context (`apps/web/src/app/hooks/useMyUser.ts`), so on a cloud switch the top header shows
   the cloud profile. All four usage sites (MyPage, ProfileEditPage, WithdrawalPage, useLinkedAccounts)
   are account-level screens.

6. **Avatars are fragmented by type and diverge from Figma.** The web-ui-kit inventory:
   `ImageAvatar / ProfileAvatar / PlaceAvatar / ChatAvatar / CloudAvatar / DefaultAvatar(user|group) / AvatarGroup`
    - the `defaultPlaceAvatar` asset. The design baselines for group room, profile, place, cloud, and
      dm/self have been updated in Figma (links below). desktop-web does not use web-ui-kit, so the
      radius is limited to apps/web.

### Constraints

- `libs/data` is shared by apps/web and desktop-web. Hardcoding a per-app display policy into the
  library drags desktop-web along with it.
- Profile-absence checks have a history of false positives from sync lag (telling the user to "set it
  up" when they already had). The cause was failing to distinguish a loading-state `null` on a reactive
  read from a genuine absence, and `isPlaceProfileAbsent`
  (`apps/web/src/app/utils/placeProfile.ts`) is the product of that lesson (await + a definite
  `active === false` flag + fail-open, ADR-0041 decision 5).
- A remote fetch to relay is not guaranteed while connected to a cloud socket. Pinning the display to
  relay has to be based on reading the relay-scoped cache.

## Decision

### 1. Make storing the embedded `$site` optional, and have apps/web store it only on relay

Open an option on `UserRepository` (a predicate that takes the context) controlling whether the
embedded `$site` is written to the place cache. It is injected at repository wiring
(`createRepositories`), and **the default keeps current behaviour (always store)** — nothing changes
for desktop-web. Only apps/web injects a predicate that stores when `cid === 'default'`.

The gate alone leaves already-polluted rows behind, so **clean up the default place leftovers stored in
the cloud scope** (the cleanup mechanism — a migration-style delete or a list filter — is settled in the
implementation spec).

### 2. `createPlace` calls `refreshList` next, inside the repository, right after success

Rather than making every caller remember, follow up with `refreshList` inside
`PlaceRepository.createPlace` so the server snapshot (including the order stamping) is reflected
immediately. Every caller benefits consistently.

### 3. Carry `id` on place.update as required (`id === sid`)

Add `id: placeId` at the `PlaceInfoPage` call site, and to prevent a recurrence normalize `id = sid` in
`PlaceRepository.updatePlace` when `id` is missing and `sid` is present. The normalization also revives
the optimistic cache write and rollback path.

### 4. Add profile creation as the last step of the place creation flow — not skippable — ❌ Reverted (2026-08-10)

> Reverted after implementation, in real use. `place.create` does not create an owner profile row for
> the new site, and the backend action `profile.set` routes to (`updateSiteProfile`) is UPDATE-only, so
> with no existing row it always 404s. It reproduces even after `createPlace` → `switchSite` has already
> succeeded (a structural limit, not sync lag), and retrying across 4.5 seconds did not resolve it —
> there is no way to fix this on the client unless the backend supports a first-profile creation path.
> `CreatePlaceDialog` was reverted to the same shape as `CreateChannelDialog` (the dialog itself holds
> `place.create` + `switchSite` and closes on success), and the forced opening of
> `PlaceProfileCreateDialog` was removed. The owner fills in the profile later through the room settings
> nudge (ADR-0040), like any other entrant.
>
> > **Re-adopted (2026-08-19):** relay pinning itself came back as
> > [ADR-0062](0062-relay-fixed-account-profile-in-mypage.md). But the path this decision argued against
> > (cache scope pin + data layer routing) was not adopted — §6 of the investigation concluded it was
> > impossible in the first place, because the read path ignores the context override. ADR-0062 does not
> > use the cache at all: it takes the **relay token** as the source and pins writes to the relay socket
> > slot.

What follows is the withdrawn original text.

Right after `CreatePlaceDialog` succeeds (create + switch), **automatically open
`PlaceProfileCreateDialog` as the last step of the creation flow**, and offer no close (X) on this
entry — the flow ends only once the profile is created. A place just created definitely has no profile,
so no absence check is needed, and the sync-lag false positive problem cannot arise at all.

Scope limit: **this enforcement applies only to the new place creation flow.** The existing entry
points — the room settings nudge (ADR-0040) and the invite path (ADR-0041) — stay skippable as they are
today. ADR-0039's principle of "do not make the profile a mandatory step" is deliberately overturned at
this one point (an exception added, not a partial supersede — the creator is the first member of their
own place, so holding them to the same precondition as an invite accepter is if anything more
consistent with ADR-0041).

### 5. Pin `useMyUser` to the relay scope — ❌ Reverted (2026-08-06) → ↩︎ re-adopted a different way by [ADR-0062](0062-relay-fixed-account-profile-in-mypage.md) (2026-08-19)

> This decision alone was withdrawn after implementation. The intended rule is not "the account profile
> is always relay" but **follow the active session** — the cloud's user profile in a cloud session, the
> relay user profile on relay. `user.update` works on both servers and edits the record the active socket
> reaches, so if display and write both follow the active socket there is no mismatch at all. `useMyUser`
> went back to observing the active context, and the relay value retention, `getRelaySessionUser`, the
> `ProfileEditPage` save gate, and the `user.update` relay pin that had gone in for it were all removed.
> Background: [relay-default-place-scoping.md](../../apps/web/docs/feature/place/relay-default-place-scoping.md) §6.
> The remaining decisions (1–4 and 6) are valid.

What follows is the withdrawn original text.

Change the hook itself to be pinned to the relay (cid=`default`) scope — pin cache reads to the relay
scope (using the existing `withContext` / context override mechanism) and perform the remote fetch only
on a relay connection. While switched to a cloud, the relay-scoped cache (plus session seed) value stays
visible. All four usage sites are account-level screens, so it is applied across all of them, and the
top of MyPage shows only the relay profile even after switching to a cloud.

### 6. Redesign display avatars into a single variant-based `Avatar`

Rebuild web-ui-kit's display avatars (place, cloud, group room, dm/self, chat placeholder, user,
including photos) as a single variant-based `Avatar` component against the Figma baseline, and replace
every usage site in apps/web. **Unification boundary**: the editing `ProfileAvatar` (the photo picker
button) and `AvatarGroup` (the overlapping layout) are different in character, so they stay separate
components — but their internal rendering uses the new `Avatar`.

Design baselines (Figma DoU):

- Place: [3700-11621](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3700-11621&m=dev) · [3769-34384](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3769-34384&m=dev) · [3700-11935](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3700-11935&m=dev) · [3408-27532](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3408-27532&m=dev)
- Profile: [3644-58498](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3644-58498&m=dev) · [3408-27063](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3408-27063&m=dev) · [2981-16916](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=2981-16916&m=dev)
- Cloud: [3037-19916](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3037-19916&m=dev)
- Group room: [3158-26215](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3158-26215&m=dev)
- dm/self: [3451-21343](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3451-21343&m=dev)

Read the nodes directly with the Figma desktop app MCP while implementing (keep that file open in Figma
desktop).

## Alternatives

- **A profile entry gate** — check for a missing profile on entering a place and show a forced modal.
  It has the advantage of covering abnormal exits and existing places too, but it carries the false
  positive risk of absence checks (the sync lag history) and the trap risk of being stuck in a
  non-closable modal if the scope is applied wrong. Rejected after review — simplified to enforcement at
  creation time.
- **A two-step creation dialog sequence** (place info → profile info → then `createPlace` →
  `switchSite` → `setMyProfile` chained at the end) — nothing gets created if the user leaves, which
  makes "mandatory" natural, but the final submit becomes a chain of three async calls and the flow can
  tangle on mid-chain failure branches (the place is created but the profile save fails, and so on).
  Rejected.
- **Roll the place back on exit** (`deletePlace`) — enforcement is achieved, but a create-delete round
  trip plus reverting the switch adds more failure modes. Rejected.
- **Hardcode `cid === 'default'` into `libs/data`** — the shortest, but it bakes an app display policy
  into a shared library and forces it on desktop-web. Replaced by option injection.
- **Keep per-type avatar components and only align them visually** — a small radius, but the
  fragmentation stays. Decided on the unified redesign (user's choice).

## Consequences

- The default place disappears from cloud home and is visible only on relay. desktop-web has no
  behaviour change thanks to the option default.
- List reflection and ordering right after creating a place are guaranteed, and editing the name/photo
  works again (the 400 is resolved).
- ~~The owner of a new place is guaranteed to have a profile, making the precondition symmetric with an
  invite accepter (ADR-0041).~~ Void, since decision 4 was reverted. The owner stays in the same
  position as every entrant other than an invite accepter, filling in the profile later through the room
  settings nudge (ADR-0040).
- The MyPage family of screens shows a consistent account (relay) profile regardless of cloud switching.
  **Trade-off**: while connected to a cloud, a relay remote fetch is impossible, so if the cache is old
  the previous value is shown (refreshed on the next relay connection).
- Avatars converge on a single API, but it becomes a sizeable UI job to replace usage sites across 10
  feature areas in apps/web. The existing per-type components are removed once the replacement is
  complete.
