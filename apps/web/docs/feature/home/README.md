# home

**The main screen at `/` — the list of places in the cloud you are connected to, the list of
channels in the place you have selected, and the sheet that moves you between clouds.** It also owns
the header identity, the unread marks for everywhere you are not currently looking, and the two
creation entries that open a new place or group room.

This document covers the **overview and structure**. The four topics with enough detail to stand
alone are listed under [Documents](#documents).

## Purpose

Home assembles screens out of runtime data; it owns no transport and no cache. Data is read through
repository `observe*` streams, refreshed by registered sync targets, and written through repository
commands — all of it reached through `runtime` from `@chatic/app-runtime`.

```bash
grep -rn "features/home" --include='*.ts' --include='*.tsx' apps/web/src | grep -v node_modules
```

**Home does not own** the subscribe-a-cloud flow ([subscription](../subscription/README.md)), the
place profile form and settings hub ([place](../place/README.md)), the room and its settings
([channels](../channels/README.md)), or invite issuing and acceptance ([invite](../invite/README.md)).
What it owns of each is the entry point and nothing behind it.

## Design principles

1. **Assemble from `@chatic/web-ui-kit`.** Header, avatars, badges, rows, sections and sheets come
   from the kit. A colour hex or an icon written directly into a home component is the violation; a
   missing primitive is added to the kit and then used.
2. **The host owns state.** Kit components hold no product state. Open dropdowns and the selected
   row are held by `HomePage` or by the list that renders them. A `CollapsibleSection` can keep its
   own open/closed fallback, but home does not rely on it: `HomePage` controls every section from a
   stored record — see [Folded sections](#folded-sections).
3. **One active place.** Selecting a place switches the backend active site and the Chat section
   follows it. Channels of several places are never fetched at once.
4. **Relay hides places, it does not disconnect them.** The relay has exactly one place and it is
   auto-selected, so the list would add nothing — only the **render** is skipped.
   `useHomePlaces`/`useSwitchPlace` still run, because the Chat section depends on `selectedPlaceId`
   and a relay home without it is an empty screen.
5. **A limit never removes a button.** `＋` entries stay visible at their cap and the attempt
   explains the refusal. "Why is this gone" is a worse question than "why can't I".
6. **Marks, not counts, for what you cannot see.** A place you are not in and a cloud you are not
   looking at are represented by presence marks, never numbers. Both are counted underneath, from
   the cache: a cloud off screen is kept current by its background socket within about a minute, and
   one past the background cap, or with no tokens yet, is as fresh as your last visit. The mark is
   true for the whole of that lag; a number would be briefly wrong in it — and the design draws a
   mark.
7. **Rendering never fetches.** The channel list is a pure cache read. Freshness is a separate
   registration the surface mounts, so scrolling a row into view cannot make a request.

## Scope

**In** — the header and its profile dropdown; the cloud promo banner; the Place section; the Chat
section with its previews, unread badges and creation popover; the cloud-switcher sheet; the place
and cloud unread marks; the three app-global runners that home exports.

**Out** — search itself (the header button only navigates to `/search`), the subscribe and IAP flow
([subscription](../subscription/README.md)), the profile form ([place](../place/README.md)), invite
issuing and acceptance ([invite](../invite/README.md)), and `apps/desktop-web`'s own switcher, which
is a different structure in a different app.

## Structure

The arrow that does **not** exist: home never imports `features/subscription`. The add-cloud button
raises a request on a store, and the private router mounts the flow's own host to answer it. That
keeps a feature that owns payment dialogs out of the screen that merely offers them.

### Boot and mount points

Three components live in this feature but are mounted by `AppRuntime`, not by the page, so they keep
working on every route: `UnreadBadgeRunner` (the app-icon badge total), `CloudPushMarkRunner`
(cross-cloud push marks, foreground and native drain) and `CloudActivatedRunner` (the
`cloud.activated` unicast → toast and catalog invalidation). The observations they read sit beside
them: the active cloud's channels and joins in `ActiveCloudDataProvider`, and every other cloud's
count in `OtherCloudUnreadProvider`.

`CloudActivatedRunner` is pinned to the **relay** socket slot, not the active one. The unicast
targets a user and is delivered by the relay deployment, so subscribing on the active slot would
miss it exactly in the common case — sitting in cloud A while cloud B finishes provisioning.

### Files whose contents the name does not give away

- `components/ChannelEmptyState.tsx` — two readings of "no rooms here", `invited` and `owner`,
  because what the user can do about it differs.
- `components/PlaceLimitDialog.tsx` — the place cap, offered as two actions rather than described
  in a toast.
- `components/cloud-session/shared.ts` — `isProvisioning`, `getCloudDisplayName` and
  `sortCloudsForSwitcher`; there is no file per helper.
- `components/cloud-session/CloudUnreadBadge.tsx` — the unread mark all three switcher row types
  share, so they cannot drift apart.
- `hooks/useAddCloudFlow.tsx` — 22 lines that raise a request on a store. It renders nothing and
  checks no quota; both belong to the subscription flow's host.
- `hooks/useReconcileInvitedClouds.ts` — purges an `invited` cache row for a cloud the signed-in
  account actually owns. **It has no caller today.**

## Usage

The private router mounts `HomeRoutes`; `AppRuntime` mounts the three runners. Those imports, plus
`useUpdatePlace` — which `features/place`'s edit page takes from this barrel — are the only things
outside home that reach into it:

```bash
grep -rn "features/home'\|'\.\./\.\./home'" --include='*.ts' --include='*.tsx' apps/web/src
```

## The two homes

**Relay** (`selectedCloudId === 'default'`). The header is `kind="no-cloud"`. **No Place section is
rendered** — the relay has one place and it is auto-selected, so the list would add nothing; the slot
goes to `CloudPromoBanner`, which appears only while the account owns no cloud and has not dismissed
it within the last 24 hours. The Chat section still fills normally, because place selection happens
invisibly — and until that resolves, the section holds the loading state described under
[Switching](#switching), which on relay is the only thing in the body.

The two section titles are the **product** nouns, not the domain's: `플레이스` / `Places` and
`채팅방` / `Chat Rooms`. `채널` is what `DomainChannel` and `ChannelRepository` are called in code and
it stays there; the screen says the word a user would.

**Cloud** (anything else). The header is `kind="cloud"`: a `CloudAvatar` built from the cloud's
initials, since `CloudView` carries no image field, beside the cloud name — read from the local cache
first and the relay catalog second, so a rename shows immediately. On a cold start with neither, the
header shows a loading placeholder rather than a nameless circle. The Place section lists the cloud's
places, the selected one carrying a badge and the others a dot when they have unread.

## Folded sections

Places, Chat Rooms and the cloud 1:1 section each fold independently, and the fold is remembered.
`useHomeSections` reads and writes the `ui.homeSectionsCollapsed` config key (`persist: 'local'`),
and `HomePage` passes each list a controlled `open`/`onOpenChange` under its own id — `places`,
`channels`, `cloudDm`. The place rooms and the cloud 1:1s are the same `ChannelList`, so the id is
what keeps folding one from folding the other.

It is not left to `CollapsibleSection`'s own state because that state lives only as long as the
section is mounted, and in ordinary use it is not: a reload, leaving home and coming back, and a
switch between relay and a cloud (which mounts or drops the Place and cloud 1:1 sections) each start
it over. So does a cold cloud switch, where the Chat section gives way to the loading state until a
place is selected. The skeleton-to-list swap inside the Place section is not one of these — both
render the same section, so React keeps it — but both branches still forward `open`.

The record is **app-wide**, not per cloud or place like sort and pins — folding Chat Rooms says how
a person uses home, not something about one place. It stores the folded ids only, so an absent or
corrupt record means everything open, which is the default it always had.

## Switching

Tapping a place row calls `switchPlace(placeId)` → `switchSite`, which owns the optimistic apply, the
commit and the rollback. With no place active — right after a cloud switch — `useSwitchPlace`
auto-selects the first; with no place at all — once the list is actually known, see below — the
Chat section is replaced by an empty state.

**A stored selection whose place has been pruned falls back to the first place.** The selected
site id persists across launches (the native shell hands the session stores `localStorage`), so it
can outlive its place: one deleted or left while the app was closed keeps its cached row until the
next full list refresh prunes it, but nothing prunes the stored id. Left alone it kept the
auto-select off, and home rendered a place nobody is in — no selected row, an empty Chat section —
until the user tapped another.

`useSwitchPlace` treats "gone" as something it **observes**, not infers: the fallback fires only
once the selected id has been seen in the list and then dropped out of it while the selection stayed
put — what the prune looks like from the cache observer. Mere absence is deliberately not enough. A
flow that switches into a place this device has not cached yet (a push tap, an invite acceptance)
lands on home with a selection the list will not carry until the refresh brings the row, and reading
that as stale would switch the user straight back out. Three more guards: the fallback waits out any
site or cloud switch in flight anywhere (the global `useIsMutating` count, since the hook's own
`isSwitching` sees only its own mutation), it never runs on the relay (one place, auto-selected), and
it attempts once per stale id, because a rejected switch rolls the selection back to that id and
would otherwise retry on every settle. What it does not cover is a row that was never cached to
begin with — a cache wipe _and_ a deletion while the app was closed — which is left to the user's
tap, as before.

`CloudSessionSheet` has three collapsible sections: the synthetic relay row (selecting it calls
`logoutCloudSession`), owned clouds with the active one pinned to the top, and invited clouds. Add-a-
cloud is a **footer**, so it survives collapsing. A provisioning row is not selectable; while the
sheet is open and any row is provisioning, a 30-second poll refetches and a ready cloud raises a
toast. The switcher is open to everyone, guests included — it is the way to reach DoU Home, see
invited clouds, or subscribe.

## When an invite lands

Home does not draw the accept screen. When an invite deep link has been resolved elsewhere and a
channel is pending, `HomePage` navigates straight into that room. There is no place-profile gate in
front of it — an invitee with no profile goes to the room and fills it in later. The screen itself
belongs to [invite](../invite/README.md).

How the room goes on the stack depends on where home sits in it:

- **Home at the bottom of the stack — push.** This is where a cold start leaves the reader. The shell
  loads home before the invite arrives, so the accept screen sits above it, and the cloud lane leaves
  by rewinding onto that home. Home is then the only entry, and replacing it with the room would leave
  the room alone on the stack with nowhere for back to go.
- **Home above the bottom — replace.** That home is a transit entry: the relay lane leaves by
  replacing its accept screen with home, on top of whatever was there before. Pushing onto it would
  stack a second home under the room, and the second back press would look like it did nothing.

## Documents

| File                                                 | What it covers                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| [last-chat.md](./last-chat.md)                       | The message preview and the list order, and why the server's summary is unused |
| [unread-dot.md](./unread-dot.md)                     | The unread formula, the place and cloud marks, cross-cloud push resolution     |
| [place-channel-create.md](./place-channel-create.md) | Creating a place or a group room — gating, caps, the two overlays              |
| [place-profile.md](./place-profile.md)               | Header identity tiers, the setup nudge, the branded place name                 |

## How to verify

```bash
npx nx typecheck web
npx nx test web
```

Traps that apply here:

- `web`'s **test** target is in the `.github/workflows/verify.yml` gate (since 2026-09-17) and is
  expected fully green — no failure baseline is tolerated any more. Read the workflow's exclusion
  list rather than this note if in doubt; it shrinks as projects are fixed off it.
- `typecheck` is in the gate and is expected clean. It pulls `@chatic/web-ui-kit`, so a kit change
  can turn this red without a line of `apps/web` changing.
- A single suite is faster than the whole target:
    ```bash
    npx jest --config apps/web/jest.config.js --rootDir apps/web ChannelList HomePage CloudSessionSheet
    ```
- Home's three runners are mounted under `AppRuntime`. A test that renders `HomePage` alone gets
  none of them, and a badge or mark assertion there will pass for the wrong reason.
