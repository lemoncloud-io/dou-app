# ADR-0162: Home asks for a missing place profile with a banner

> Status: Accepted · Decided: 2026-10-02 · Implemented: `feat/place-profile-setup`
> · Scope: `apps/web/src/app/features/home/{hooks/usePlaceProfileNudge.ts,components/PlaceProfileBanner.tsx,stores/usePlaceProfileBannerStore.ts,pages/HomePage.tsx}`
> · `apps/web/src/app/hooks/usePlaceProfileAbsent.ts`
> · Follows [ADR-0161](./0161-a-place-profile-is-written-from-inside-its-place.md), and takes up the
> re-prompting UX that [ADR-0039](./0039-dm-display-name-chain-and-invite-profile-release.md) and
> [ADR-0041](./0041-place-profile-as-invite-precondition.md) left out of scope
> · The module doc is [home/place-profile.md](../../apps/web/docs/feature/home/place-profile.md#the-banner--a-missing-profile-on-home)

## Context

ADR-0161 asks for a place profile where a person enters a place: creating it, the onboarding wizard,
and accepting a cloud invite. That covers people entering a place from now on. It leaves three groups
with no profile and nothing on home to say so:

- **Members from before** the entry steps existed. Nothing backfills them.
- **People who left the step.** A cloud invite is already accepted when the profile is asked for, and
  a save that failed once makes the form closable. Creating a place whose switch failed leaves the
  creator outside it, and the dialog closable.
- **Reads that failed open.** `isPlaceProfileAbsent` treats an inconclusive read as "present", so an
  outage at the moment of entry skips the step for good.

What they had was the header label "Set up your profile" in the empty name slot, read from the
cache, and the room-settings row that prompts on the server's answer, which only shows if someone
opens room settings. `home/place-profile.md` recorded "no banner, no toast" as a rule; ADR-0039 and
ADR-0041 had only deferred the question, not decided against a surface.

## Decision

1. **Home shows a banner while the server says I have no profile in the active place.** The verdict is
   `usePlaceProfileAbsent` — `profile.get-mine` answering `active: false` with no nick — the same one
   room settings uses. A cache that does not hold my row is not a verdict, so it shows nothing.
2. **The read waits for the socket and for any place switch.** Home mounts before the socket is
   verified on a cold start, and during a switch the session can still be on the place being left. A
   read sent then fails, or answers for the wrong place, and the judgement fails open — so the banner
   would be missing on exactly the cold start where it matters. "Any switch" is the app-wide count on
   the shared switch mutation keys: a push tap or the search screen switches places while home stays
   mounted. `usePlaceProfileAbsent` takes an `enabled` option for this; its other callers keep the
   default. A cached nick holds the read too, since that person can never see the banner.
3. **A verdict is only returned for the key it was read for** (`${sid}@${uid}`). Without that, the
   render that moves the key answers with the previous place's verdict until the effect runs.
4. **The banner opens the existing create form, which can be left**, with the unsaved-changes guard.
   It is an invitation, not a gate; the entry points are where the step is required.
5. **Closing it lasts until the app starts again, per place and person.** In memory, not persisted: a
   persisted close would make it a one-time notice and leave the people it is for without a name.
6. **One banner at a time on the relay.** It takes the cloud promo's slot while it shows; naming
   yourself comes before an upsell.
7. **The form outlives the card.** A save writes my nick to the cache before the server answers,
   which hides the card. The form is mounted beside the card, not inside it, so a failed save keeps
   its error on screen.

## Alternatives

- **A required full-screen form on home**, as the invite step is. Rejected: ADR-0012 tried a mandatory
  home-entry dialog and `98a4685ff` removed it — it held people on home, and a failing read or save
  would lock the hub of the app. An existing member who has used the app without a profile would also
  meet a wall the day this ships.
- **Read the verdict from `useMyProfile`'s cached row** (`active === false`, no nick) instead of a
  separate read. No extra request, but a stale cached row shows the banner — and its blank form — to
  someone who set a profile elsewhere, until the refresh lands. That is the overwrite room settings
  was just fixed for.
- **Persist the close (e.g. 24 hours, like the cloud promo).** Rejected: the promo is an upsell and
  can wait; a missing name is a gap in other people's view of the room, and the next launch should ask
  again.
- **A badge on the header avatar only.** Quieter, but the header label already says "Set up your
  profile" in that slot and has not been enough.

## Consequences

- People without a profile now see it on every launch, in every place they open, until they make one
  or close it for that run. Places they never open are not asked about; they cannot write a profile
  there anyway, since the server writes to the session's place.
- Home sends one more `profile.get-mine` per mount for someone whose cache holds no nick there
  (deduplication in `useMyProfile` does not cover it). Someone with a nick sends none.
- On the relay, the cloud promo is not shown to someone without a profile until they have one or
  close the banner.
- `desktop-web` is unchanged; it has neither the entry steps nor this banner.

## References

- [ADR-0161](./0161-a-place-profile-is-written-from-inside-its-place.md) — the entry steps this backs up
- [ADR-0041](./0041-place-profile-as-invite-precondition.md) and
  [ADR-0039](./0039-dm-display-name-chain-and-invite-profile-release.md) — where re-prompting was deferred
- [ADR-0012](./0012-place-profile-creation.md) — the mandatory home-entry dialog that was removed
