# ADR-0153: Mobile neither opens nor lists a cloud 1:1

> Status: Proposed — the product reason is pending (§ Context) · Decided: 2026-10-01
> · Scope: `apps/web/src/app/features/home/**` · `apps/web/src/app/features/channels/**` ·
> `apps/web/src/app/hooks/useChannelUnreads.ts`
> · Supersedes, for mobile only: [ADR-0113](./0113-a-cloud-1-1-has-no-invite-and-no-place.md)
> decisions 8 and 9 and its cloud-scoped section · Desktop is unchanged and keeps
> [ADR-0141](./0141-desktop-lists-a-cloud-1-1-in-the-places-its-peer-shares.md)
> · The module doc is [dm-and-self-chat.md](../../apps/web/docs/feature/channels/dm-and-self-chat.md)

## Context

ADR-0113 gave mobile three surfaces for a 1:1 opened inside a subscription cloud: a peer picker
behind the home create menu, a "1:1 대화하기" row on a participant's profile, and a cloud-scoped
section on home where the rooms are listed afterwards. Desktop later filed the same rooms under the
places their peer shares with me (ADR-0141) and said, in its § Desktop only, that mobile kept the
single section.

The product owner has decided that mobile drops the cloud 1:1. The relay 1:1 — reached by inviting
a phone number — is a different flow and stays. **Why mobile drops it is not recorded yet**; this
record stays Proposed until it is, and the reason is written here in place of this paragraph.

## Decision

### 1. Mobile offers no way to open a cloud 1:1

The peer picker (`/channels/start-dm`) and the profile row are gone, along with the hooks only they
used (`useStartDm`, `useCloudDmCandidates`). The create menu's `1:1 대화` entry is drawn on relay only
and always goes to the contact form. ADR-0113 decision 9's split — the list draws the entry, the page
picks where it goes — stays in the code; it now has one destination.

An invited cloud therefore has no `＋` at all: `canCreate` still guards the group row, and the 1:1
row that ADR-0113 opened the popover for is gone.

### 2. Mobile lists no cloud 1:1 on home

The cloud-scoped section no longer takes cloud 1:1s. `isInPlaceList` already keeps them out of every
place's list, because the place a cloud 1:1 carries is only where its creator stood, so with the
section narrowed no home list shows one.

A cloud 1:1 still exists — desktop opens them — and one that reaches mobile another way, a push tap
or a search result, still opens and is drawn by every room rule in the module doc.

### 3. Its unread reaches no mark

`useChannelUnreads` counts a cloud 1:1 for its own row only and leaves it out of the place and total
sums. Every mobile count runs through that function — the place dot, the bottom nav, the
other-cloud count behind the switcher and the cloud sheet, and the app-icon badge — so the one rule
covers all of them. A count with no row to open would be a mark nothing on screen can clear.

### 4. The section holds the cloud's self chat, and is drawn only once it exists

The self chat moved into the section with the cloud 1:1s shortly before this, because it belongs to
the account rather than to a place. It stays there, under a "나와의 채팅" heading. The section is drawn
only when the room is in the cache: a cloud does not make the room on its own and mobile does not ask
for it (`channel.get-self` runs on the relay only), so a mobile-only member may have none. Its stored
fold id keeps the name `cloudDm`, because renaming a stored key would reset everyone's fold.

## Alternatives

- **List cloud 1:1s with the place's group rooms.** By the room's own `sid` it would show the room to
  its creator and hide it from a peer who is not in that place — the failure ADR-0113 decision 1
  exists to prevent. In every place's list it would avoid that, but at the cost of the same room
  everywhere. Desktop's answer (ADR-0141, `cloudDmPlaces`) is the sound version; it lives in
  `apps/desktop-web` and would have to move into a lib first. Not chosen: the decision was to drop the
  rooms from mobile, not to re-file them.
- **Keep listing existing cloud 1:1s, read-only.** Removes only the ways in, and no unread is
  stranded. Not chosen for the same reason.
- **Keep counting them.** A place dot, a bottom-nav count and an app-icon number would rise for a
  room home cannot show, and clear only through a push tap or a search.

## Consequences

- **An invited member on mobile cannot reach a colleague 1:1 at all.** That was the case ADR-0113
  decision 9 opened the popover for.
- **A cloud 1:1 opened on desktop is invisible on mobile home**, and a message in one is learned of
  from its push alone. Read on desktop or not, it moves no mobile count.
- **A foreground push from a cloud 1:1 in another cloud can still light that cloud's mark for a
  moment.** The push mark is set before the cloud's delta lands and is cleared by that delta, after
  which the count — which leaves the room out — has nothing to show.
- **A background push from a cloud 1:1 still raises the app icon.** The shell counts the push
  natively while the web is not running, and the number drops back the next time the web writes the
  badge from its own count, which leaves the room out.
- The room rules in the module doc for a cloud 1:1 (the lineage, the title chain, `profilePlaceOf`)
  stay, because the room can still be opened.
