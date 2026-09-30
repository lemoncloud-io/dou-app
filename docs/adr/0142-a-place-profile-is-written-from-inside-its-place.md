# ADR-0142: A place profile is written from inside its place, and asked for where a person enters one

> Status: Accepted · Decided: 2026-09-30 · Implemented: `feat/place-profile-setup`
> · Scope: `libs/data/src/repositories/ProfileRepository.ts` · `apps/web/src/app/hooks/useSetMyPlaceProfile.ts`
> · `apps/web/src/app/features/{home/components/CreatePlaceDialog.tsx,onboarding/pages/SetupWizardPage.tsx}`
> · `apps/web/src/app/features/invite/accept/{hooks/useInviteAccept.ts,components/CloudInviteAccept.tsx}`
> · `apps/web/src/app/features/channels/{pages/ChannelSettingsPage.tsx,components/PlaceProfileEditDialog.tsx,hooks/useChannelProfiles.ts}`
> · Re-adopts [ADR-0094](./0094-relay-default-place-scoping-profile-step-and-avatar-unification.md) decision 4
> (reverted) with the cause of its failure fixed · Narrows [ADR-0085](./0085-sid-is-a-value-not-a-cache-scope-axis.md)
> for `profile.set`
> · The module docs are [place-channel-create.md](../../apps/web/docs/feature/home/place-channel-create.md),
> [invite](../../apps/web/docs/feature/invite/README.md#cloud-invites-the-profile-comes-after-the-place),
> [channel-settings.md](../../apps/web/docs/feature/channels/channel-settings.md) and
> [repositories/domains.md](../../libs/data/docs/repositories/domains.md#profile)

## Context

Every person in a place should have a profile there — the nick and photo others see them by. Three
ways into a place produced people without one: creating it, the onboarding wizard after a
subscription, and accepting a cloud invite. Creating a place once had a mandatory profile step
(ADR-0094 decision 4); it was reverted because the first save always answered 404, and the revert
recorded the cause as "the backend cannot create a first profile".

That diagnosis was taken apart by measuring against the dev server, frame by frame:

| Request                                                           | Server's answer                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `profile.set` naming a new site while the session sits on another | **updated the other site's profile** — the payload's `siteId` is ignored         |
| `place.create`                                                    | makes **no** profile row for the creator; its `:ok` is the user record           |
| `profile.set` right after switching into a new site               | `404 … @updateSiteProfile` — it **only updates**                                 |
| `profile.get-mine` in that same session                           | **creates** the row (`active: false`, no nick) — it is a get-or-create           |
| the same `profile.set` again                                      | `ok`                                                                             |
| `user.invite` (a room invite, sent with only `channelId`)         | answers with the room's `siteId` and `site$`, and a pre-created invitee `userId` |

So the reverted step failed twice over. The session was not in the new place when it wrote, and even
once it was, `profile.set` cannot create. The original attempt also cached the created place under
the wrong id, which made every write 404 for a reason unrelated to either.

Meanwhile the client assumed the reverse of the first row. ADR-0085 made the site an argument of every
write so that a switch in flight could not misroute it, and `useSetMyPlaceProfile` let a caller name
any site. For `profile.set` that argument tags the optimistic cache row and nothing else. The
onboarding wizard created a place and wrote the profile without entering it — naming the selected
place, which was still the previous one — and so overwrote the profile of the place the owner had
been in before. Naming the new place instead would not have helped: the server ignores the name.

Separately, the "you have no profile" prompt in room settings read absence from the local cache. With
my row missing from IndexedDB (a cold cache, a new device, a fetch in flight or one that failed) it
prompted a user who had a profile, and its blank create form would have overwritten their nick. The
profile edit dialog opened blank the same way and kept the blank after the profile arrived.

## Decision

1. **A profile is written only from inside its place.** `useSetMyPlaceProfile` is the single write path
   for every screen. It takes no site: it writes to the active place, and refuses while a site switch
   is in flight, because a switch pre-applies the selection before `auth.switch` commits.
2. **The repository checks where a write landed.** `setMyProfile` still names its site, and compares it
   with the site in the response. On a mismatch the write has already happened elsewhere: that row is
   cached as the server now holds it, the optimistic row is rolled back, and the call rejects. A failed
   write with no previous row removes the optimistic row instead of leaving it behind.
3. **The first write recovers from update-only.** On a 404, `setMyProfile` sends `profile.get-mine` —
   which creates the row — and retries the same write once, unless `get-mine` answers for a site
   other than the one named (the retry would then create and fill a row there). Any other failure, or
   a second 404, is a failure.
4. **A profile is asked for where a person enters a place, after the switch and before they are seen:**
    - creating a place: create → switch → profile (`CreatePlaceDialog`);
    - the onboarding wizard: step 2 switches into the place it creates, step 3 writes there;
    - a cloud invite: accept → cloud → switch into the invited place → profile when there is none → room.
      The place comes from the invite's `siteId`, else its `site$`, else the room's own `sid`; with none,
      the step is skipped and a warning is logged.

    The step is required — no way out — until a save has failed once. After that it can be left, and the
    flow continues. Holding a person on a form the server will not accept is worse than a place without
    a profile, which the prompts below pick up.

5. **"No profile" is the server's answer, never the cache's.** A prompt that acts on it — the
   room-settings row, the invite and create steps, the edit dialog's blank form — appears only when
   `profile.get-mine` has answered with no profile (`active: false`, no nick). Home's header label
   still reads the cache; it fills an empty name slot and opens nothing. A cache that lacks my row
   means "not known yet": the room-settings row shows a generic label, and the edit dialog shows a
   loading screen until my row arrives or the server says there is none. `useChannelProfiles` no longer
   returns the `hasSnapshot` flag that conflated the two.
6. **A retry does not repeat what already succeeded.** When a create went through and its switch
   failed, the retry repeats only the switch (the create dialog and the wizard); an invite accept is
   not run twice by a second tap while the first is in flight. Going back in the wizard and confirming
   the place step again still creates another place — that is a new submission, not a retry, and was
   so before this decision.

## Alternatives

- **Name the new place in the payload.** Rejected: the server ignores it — a write naming a new site
  updated the previous site's profile (the first row of the table above).
- **A client-side write queue** that holds the profile until the place exists. Rejected: none of the
  failures was ordering. `await` already orders create before write; a queue would not have changed
  the session's site or made `profile.set` create a row, and persisting it would bring duplicate
  places (`place.create` carries no idempotency key) and a second record of state the server already
  answers.
- **Collect the profile before the create and write it once the create resolves** (the shape of the
  original attempt, `0749334da`). Rejected: it pinned the write to the new place's id, which the server
  ignores, so it depended on the switch anyway, and it could not survive update-only.
- **Have the backend create the creator's profile inside `place.create`** (and upsert in `profile.set`).
  Preferred in the long run — no window where a place exists without its creator's profile, and no
  dependence on the switch — but it is a backend change. The client recovery in decision 3 does not
  preclude it; it becomes dead weight when the server upserts.
- **A blocking profile modal on entering any place.** Rejected again for the reasons the home-entry
  prompt was removed in `98a4685ff`: it held invitees on home and could not tell "loading" from
  "absent". Entry points that are a moment of commitment get the step; the rest get prompts.

## Consequences

- Creating a place, finishing the wizard and accepting a cloud invite end with a profile in the place,
  verified end to end on the dev server for the invite (a person without a profile gets the form, one
  with a profile goes straight in) and for the first write after a switch (404 → get-mine → ok).
- Someone who leaves an app mid-form, or a place created before this, still has no profile. Nothing on
  home says so visibly yet — the only prompts are in room settings and inside the header menu. A
  visible, non-blocking prompt on home is the follow-up, and it must use the same server verdict.
- Room settings sends one more `profile.get-mine` per open. Several screens send it; they are not
  deduplicated.
- On web, `auth.switch` intermittently fails with `403 invalid sign` in dev. Where it fails, the switch
  fails and every flow above stops before the profile step: the wizard and create dialog stay on their
  step and retry only the switch; an invite entry reports an entry failure.
- A cloud invite whose place cannot be named at all enters without the step, and says so in the log.
- `desktop-web` and `testbed` call `setMyProfile` too; they now see a rejection when a write lands on
  another site, where they used to see success. desktop-web's save held on to the place it mounted
  on, which would have turned every save after a place switch into a false rejection; it now names
  the place selected at the time of the save.
