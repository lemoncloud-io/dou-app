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

**In** — the header and its profile dropdown; the cloud promo banner; the missing-profile banner; the
Place section; the Chat section with its previews, unread badges and creation popover; the rows'
swipe actions (pin, mute, leave or delete); pull-to-refresh on the body; the cloud-switcher sheet;
the place and cloud unread marks; the three app-global runners that home exports.

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
it within the last 24 hours, and gives way to the missing-profile banner
([place-profile](./place-profile.md#the-banner--a-missing-profile-on-home)) while that one shows.
The promo is **off by default**: it is not rendered at all until the relay cloud catalog has answered
once (`hasCloudCatalog`). Before that the catalog's `clouds` is an
empty stand-in that reads as "owns no cloud", so gating on it alone showed an owner the pitch on every
cold start and pulled it away a beat later; a failed first fetch keeps it off for the same reason —
no answer is not "no cloud". The Chat section still fills normally, because place selection happens
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

**The profile menu** holds "Place settings" and, for the owner of the active cloud place who has
turned on the Lab experiment, "Invite to place". Both act on the session's place — there is no
per-row action on the place list. That
matters for the invite: the server files it under the site the session is on, so the entry is held
(disabled) while a place switch is moving the session, and hidden outright where the user can never
invite (the relay, a place they do not own, a guest) or has not opted in. The rule and the page behind it — the room invite's contact invite, bound to the place — belong to
[invite](../invite/place-invite.md).

**The tier pill** (header, and the profile menu on a cloud) is FREE or PRO: PRO when the membership
is valid **or** the catalog holds an active cloud. PRO is final the moment either source says so,
but FREE needs both to have answered, since either could still make it PRO. Until then the tier is
undecided and both surfaces hold a pulsing placeholder of the pill's size
(`SubscriptionBadgeSkeleton`; `AppHeader`'s `planLoading`) — not a guessed FREE that flips, and not an
empty slot the pill later pops into. A failed catalog fetch counts as answered here, so the tier
falls back to membership alone rather than pulsing forever.

The membership half reads the server's `isValid`, which [subscription](../subscription/README.md)
warns is not entitlement: it goes false during a scheduled cancellation while the paid period still
runs. So a subscriber who has scheduled a cancellation and has no active cloud reads FREE here. That
is a known gap, not an intended rule.

## Folded sections

Places, Chat Rooms and the Self Chat section each fold independently, and the fold is
remembered. `useHomeSections` reads and writes the `ui.homeSectionsCollapsed` config key
(`persist: 'local'`), and `HomePage` passes each list a controlled `open`/`onOpenChange` under its own
id — `places`, `channels`, `cloudDm`. The place rooms and the notes-to-self room are the same
`ChannelList`, so the id is what keeps folding one from folding the other. The last id predates the
section losing its cloud 1:1s and keeps its name because it is a stored key.

It is not left to `CollapsibleSection`'s own state because that state lives only as long as the
section is mounted, and in ordinary use it is not: a reload, leaving home and coming back, and a
switch between relay and a cloud (which mounts or drops the Place and Self Chat sections) each start
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
leaves a selection the list will not carry until the refresh brings the row, and reading
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

## Pull to refresh

The scrolling body under the header is the kit's `PullToRefresh`: from the top of the list, a drag
down reveals a small disc holding the DoU character, and the disc fills from the bottom in the accent
colour as the pull goes on — a gauge. The character grows, straightens and takes on its colour with
the fill. The gauge fills in eight steps: each of the first seven crossed on the way down plays a
light `selection` tick, so a pull is felt filling up as a run of ticks, and the eighth is the fill.
Pulling back and down again ticks again, but a step only re-arms once the pull is 3px clear of its
boundary, so a finger resting on one does not buzz with every tremble. At 64px (after the pull's
resistance halves finger travel) the gauge is full, and **the refresh starts right there, finger
still down** — the phone gives the stronger `impact` tap and the character pops, see
[Haptics](#haptics). It does not wait for the release: a full gauge that still needed letting go
would put the strongest feedback a beat before the thing it announces. The cost is that past the
fill there is no backing out — pulling back does not cancel the refresh. Once a touch has filled the
gauge it makes no more ticks. While the refresh runs the character wobbles in the full disc; on
release the list settles into the indicator's slot, or straight back if the refresh already ended,
and the disc keeps its reading as it rides up rather than emptying on the way out.

It is touch-only — a mouse drag does nothing — and a pull that starts below the top, or moves
sideways or up first, is an ordinary scroll. The first 6px of travel decide which it is, since iOS
reports one-pixel moves and the first alone is jitter. A second finger, or the system taking the
touch, drops a pull that has not filled; one that has keeps its refresh.
The release is heard on the element the finger landed on, not on the list, so a skeleton row that
gives way to real rows mid-pull still lets the list go back.

A pull adds **no fetch of its own**. It asks, sooner, for what the screen would get anyway:

- `requestBackgroundRefresh()` — one pass of the global background sync, the same one that runs on
  the verified edge: place snapshot, channel delta (which carries the cloud 1:1s as well), my
  profile, profile delta (skipped with no place), sent relay invites (relay only, and never for a
  guest), and the relay self channel. That sync is mounted once under `AppRuntime`, not by home, so
  the request goes through a registered handler rather than a second copy of the hook. A pull made
  while an earlier one is still running joins it.
- `refetchClouds()` and `refetchMembership()` — the two queries behind the header's cloud name and
  tier pill, which the background sync does not own. The catalog is asked only with a session,
  because its query is disabled without one and `refetch` does not honour that.

The indicator stays up until all three have settled, or 10 seconds at most, and every part is
best-effort: a failure ends the pull just as a success does, with whatever the cache already held
left in place. The cap is for a socket that is dead but not yet known to be — right after a return
from the background — where a request would otherwise hold the indicator for its full 30-second
timeout. It stops the waiting, not the work. On a socket that is
not verified, or mid-switch, the background pass sends nothing and settles at once — it would be
answered by the wrong session — so the indicator only covers the two queries there.

A pull re-reads lists; it does not re-read message history. Rows' previews follow from the chat
sync home already registers, which catches a row up whenever the channel delta moves its head.

## Row swipe actions

Every room row in the Chat section, and in the Self Chat section, slides sideways to reveal actions
behind it — the kit's `SwipeActionRow`, which owns the gesture and nothing else.

| Swipe | Actions                                                                   |
| ----- | ------------------------------------------------------------------------- |
| Right | Pin or unpin                                                              |
| Left  | Notifications off or on, then Leave — or Delete, for a group room you own |

- **Leave or delete is decided per row** by `removalActionFor`, the rule the room's settings screen
  and the place's bulk remove already share: a 1:1 always leaves, even for the person who opened it,
  and a group deletes only for its owner (`channel.ownerId`). Both ask first, with the settings
  screen's own confirmation and copy — a 1:1 has its own wording — and neither runs until confirmed.
- **Notifications** write my join row's `notify`, as the settings switch does. The write is
  optimistic, so the bell-off glyph is the answer; only a failure speaks, as a toast.
- **Pin** is the place's client-side pin list (`usePinnedChannels`, scoped to cloud and place). A pin
  moves the row, often out from under the finger, so it is confirmed with a toast. The Self Chat
  section has no pin list behind it, so its row has no right swipe — and with no left side either, a
  cloud's self chat does not swipe at all.
- **A self chat** in a place's list (relay) has a pin and no left side — its settings offer neither
  notifications nor an exit. Someone else's self chat, which is only ever a row left over from the
  previous account, has no actions at all. Sent-invite rows do not swipe.

One row is open at a time: `ChannelList` holds which. A tap on an open row's content, a scroll that
starts on it and a touch anywhere else all close it, and none of them also does what the tap would
otherwise have done — the row does not open its room, the button elsewhere is not pressed. A drag
that crosses the point where letting go opens a side gives a `selection` haptic.

The gesture is touch-only, like the pull, and decides at the pull's own 6px (the kit shares the
constant): the pull claims a touch leaning down, the row one leaning sideways, and judged on the same
move those cannot both hold, so the two never share a touch. Before that point a sideways-leaning
move is already held back, so the WebView cannot start scrolling the list under a row that is about
to slide. There is no keyboard or screen-reader path to these actions on home: the same actions
stay in each room's settings.

## Haptics

The page cannot make a haptic itself — WebKit implements no `navigator.vibrate` — so home asks the
shell, through `haptics.play(kind)` in `app/bridge/haptics.ts`. The kinds name a feel, not a gesture:
`selection` for a row reaching its actions and for each step of the pull-to-refresh gauge, `impact`
for the gauge filling and the refresh starting.

The web ships ahead of the app, so an installed app older than the message answers `NOT_FOUND`. One
such answer settles it for the session and nothing more is sent; a browser is never asked. After the
first answered request every haptic is a one-way post that the shell plays without replying, so a
gesture never waits on a round trip. Only that first request is ever out at a time: while it is
unanswered further haptics are dropped, so the run of ticks on a session's first pull sends one
request rather than eight. The shell honours the device's own touch-feedback setting.

## When an invite lands

Home draws neither the accept screen nor the room it leads to. An accepted invite opens its room
from the layout, on whichever screen leaving the accept screen lands — see
[invite](../invite/README.md#leaving-the-accept-screen-and-opening-the-room). Home adds no
place-profile gate of its own: the cloud accept pipeline asks for the profile between the site switch
and the room ([invite](../invite/README.md#cloud-invites-the-profile-comes-after-the-place)), and an
invitee who leaves that form fills it in later.

## Documents

| File                                                 | What it covers                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [last-chat.md](./last-chat.md)                       | The message preview — text, deleted or attachment kind — the list order, and why the server's summary is unused |
| [unread-dot.md](./unread-dot.md)                     | The unread formula, the place and cloud marks, cross-cloud push resolution                                      |
| [place-channel-create.md](./place-channel-create.md) | Creating a place or a group room — gating, caps, the two overlays                                               |
| [place-profile.md](./place-profile.md)               | Header identity tiers, the setup nudge and the missing-profile banner, the branded place name                   |

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
