# Home screen: migrate to web-ui-kit — two collapsible sections, a header that knows the connection type and the plan

## Status

accepted

Decided: 2026-07-15

## Context

`libs/web-ui-kit` shipped in PR #370 with its Figma-derived components — `AppHeader`, `ListSection` /
`SectionHeader`, `ListRow`, `PlaceAvatar` / `ChatAvatar` / `CloudAvatar`, `UnreadBadge` /
`VerifiedBadge`, `SubscriptionButton`, `BottomSheet`, `EmptyState`. The home screen
(`apps/web/src/app/features/home`) has not migrated. Its header, `PlaceList` and `ChannelList` are
hand-written with lucide icons and hardcoded hex colours (`#F41F52`, `#102346`), reimplementing
components the kit already has.

A UI redesign landed in Figma. The reference frames (file `ViwLfjc5Eoq7BpEXFfFj3W`):

- `2899-22022` — relay / default: logo header, one place `Default place`, the Chat list
- `2675-14545` — the Chat `＋` popover (`1:1 chat` / `Create group room [PRO]`)
- `2899-20903` / `2899-21186` — the profile on the right → dropdown (`Profile / Notifications / Settings`)
- `2931-8611` — a cloud with **several places** (vertical list, selected = ✓, unread = dot)
- `3086-13128` — connected to an invited cloud (cloud name header, `Invited place`)
- `2870-21093` / `2933-9794` / `2933-10249` — the redesigned cloud switch sheet

The main requirements, from the request itself:

- State differs by **connection type** (relay = Default Cloud vs. a cloud) and by **plan**
  (free / pro).
- Header left: relay → the brand logo; cloud → the cloud name plus the cloud profile.
- Header right: the **place (site) profile**, which opens a menu when clicked.
- Places and channels are **expandable and collapsible**.
- The default place is the relay server's own place. A cloud lists its own places, and selecting a
  place shows that place's channels.
- Search is **not built yet (TBD)**.

The request's word "accordion" was pinned down against the mockups: not a Slack-style tree nested per
place, but **two sections, Place and Chat, each collapsing independently**. Every state maps onto the
existing home hooks (`useHomePlaces`, `useSwitchPlace`, `useHomeChannels`, `useActiveCloudChannels`,
`useChannelUnreads`, `resolveHeaderProfile`).

## Decision

**Scope: migrate the home screen to `web-ui-kit`, and add to the library only the primitives that are
genuinely missing.** Data flow, hooks, the sync registration model and route targets are preserved —
this is a presentation-layer migration, not a rewrite.

### Header — adopt `AppHeader`

- Relay / Default Cloud → `kind="no-cloud"` (the DoU logo plus the switch chevron).
- Cloud → `kind="cloud"` (cloud avatar, cloud name, switch chevron). There is a second line slot for
  `<place nickname>` (`AppHeader.subName`), hidden in the current mockups — show it optionally.
- The left chevron (`onSwitcher`) opens the cloud switch sheet.
- The right cluster: the `planTier` badge (`free` / `pro`, derived from the subscription) → the
  subscription screen; the search button (`onSearch`) renders as a **TBD placeholder**; the profile
  avatar shows the **place (site) profile** (nick and thumbnail are already resolved by
  `resolveHeaderProfile` — the account profile inside Default Cloud, the site profile elsewhere).
- The profile avatar opens a **dropdown** (`Profile / Notifications / Settings`) rather than
  navigating directly. `Profile` goes to profile settings (site profile edit outside the default
  cloud, account edit inside it); `Notifications` and `Settings` reuse the existing routes.
- The current `⋮` overflow (report an issue) and the cloud error banner are **removed or simplified**
  on home. If reporting an issue stays, it moves under settings.

### Place section — a collapsible vertical list

- A collapsible section (`SectionHeader` plus a collapse chevron).
- Vertical place **rows**: `PlaceAvatar` plus the name plus a subtitle (`Default place` / `My place` /
  `Invited place`). The selected place gets a blue ✓; an unselected place with unread gets a red dot
  (derived from `unreadByPlace`).
- **Keep the single-active model**: selecting a place calls `useSwitchPlace` (the backend active-site
  switch), and that place's channels render in the Chat section. A cloud may list several places; relay
  shows one default place.
- The `＋ Add place` row at the bottom of the section is **owner only**. The mockups hide it for relay
  (`2899`) and for an invited cloud (`3086`), and show it only in an owned cloud (`2931`) — which
  matches the existing `permissions.canCreatePlace` gate. Relay shows its one default place and no add
  row.

### Chat section — a collapsible list, plus a context-aware `＋` popover

- A collapsible section (chevron toggle).
- The **`MY` / self chat row** is always first. The mockups show the `MY` badge on the self row in
  **every mode**, relay and cloud (invited included), with no timestamp and no unread count. (The
  current `currentWSS === 'relay'` gate in the code is narrower than this design, so re-check it while
  implementing.)
- Ordinary channel **rows**: `ChatAvatar`, name, member-count badge, last-message preview, time and
  `UnreadBadge`.
- `＋` opens **a popover with exactly one item, chosen by connection type**:
    - Relay → `1:1 chat` only.
    - Cloud (owner **or** invitee) → `Create group room` only.
- `Create group room` is **PRO gated**: no subscription → the existing upsell dialog; subscribed → the
  existing `CreateChannelDialog`.
- `1:1 chat` is **TBD**: place the button, but do not build the friend-picker flow in this round.

### Cloud switch sheet — reskin only, logic preserved

- Reskin to the new Figma (`BottomSheet`): the `My clouds` / `Invited clouds` tabs, rows with
  subtitles (owned = account / email, invited = `<name>'s cloud`), the ✓ on the selected row, and
  `＋ Add cloud`. The profile section at the top is **removed**, since the profile moved into the
  header dropdown.
- **Every existing behaviour stays**: provisioning polling and its badge, renaming a cloud,
  disconnect / sign out, adding an account, switching to an invited cloud.

### New `web-ui-kit` components

Added to the library (used by home, reusable elsewhere):

- **A collapsible section** — give `SectionHeader` an expand/collapse affordance (chevron rotation
  plus showing or hiding the content), with the collapsed state controlled by the host.
- **The header profile dropdown** and the **`＋` creation popover** are composed in the host out of
  the existing `DropdownMenu` primitive. If the spec phase finds a reusable shape worth promoting into
  the kit, promote it then.

## Considered Options

- **A Slack-style accordion nested per place** (each place row expands its own channels, several open
  at once) — rejected: the mockup (`2931-8611`) drives one Chat list from a single selected place, and
  nesting would require fetching and syncing every place's channels at once, which breaks the current
  active-site data flow.
- **Clicking the right-hand profile going straight to profile settings** (as the request worded it) —
  rejected in favour of the Figma dropdown (`Profile / Notifications / Settings`). `Profile` still
  reaches the settings screen, and the dropdown adds the notification and settings entry points the
  design asks for.
- **The `＋` popover always showing both items and only gating them** (mockup `2675`) — rejected in
  favour of the settled rule: one item per connection type (relay → 1:1, cloud → group).
- **Redesigning the cloud switch sheet's logic as well** — rejected: reskin only. Provisioning,
  renaming and disconnect are core behaviour and out of scope here.
- **Keeping the hand-written home components** — rejected: they are the source of the drift this
  migration exists to remove (duplicated avatars and badges, hardcoded colours).

## Consequences

- Home renders from one design system. A future design change edits the kit, not home's own markup.
  Hardcoded colours and duplicated avatar/badge code go away.
- The header becomes fully data-driven on connection type plus plan. One `AppHeader` serves relay, an
  owned cloud and an invited cloud.
- The collapsible section becomes a reusable kit primitive.
- `1:1 chat` and search stay visible but inert (TBD). That is intended — both need flows that are out
  of scope (friend picking, search). They have to read as obvious placeholders rather than dead
  buttons, and each is tracked as follow-up work.
- **An assumption to confirm:** the gear-icon cloud header visible behind the sheet in `2870-21093` /
  `2933-*` is taken to be a _different screen_ (place detail or settings), not the home header — home
  uses the profile-avatar header (`2931-8611` / `3086`). Confirm before implementing.
- Preserving `useSwitchPlace` means selecting a place still performs the backend active-site switch,
  optimistically, as its contract already says. Unread dots on unselected places ride on the existing
  `useActiveCloudChannels` aggregate.
