# ADR-0022: Move channel invites from a dialog to a page, and apply the Figma UI

> Status: Accepted · Decided: 2026-07-20

## Context

Channel invites are a slide-up **dialog** today (`InviteFriendsDialog.tsx`), opened with `useState`
from two places, `ChannelRoomPage` and `ChannelSettingsPage`. The logic is multi-select over the native
contact list (`appBridge.getContacts()`) followed by a batch invite (`useCreateInviteBatch`); on the
web, where contacts are unavailable, it falls back immediately to `AddFriendSheet` (typing a name and
number by hand).

Figma reworked the invite flow into seven screens (friend selection empty / selected / at the limit,
the invite link with its copy and share toasts, and contacts permission off), and the code has to
follow. The requirements:

- The invite screen is **a page, not a popup**.
- Components come from `@chatic/web-ui-kit`, and anything missing is defined in the library first.
- Icon resources are pulled from Figma.

The Figma nodes: `3144-24277` (friend selection 0/100), `3143-23504` (10/100 selected), `3143-23575`
(100/100, at the limit), `3143-23721` (invite link), `3153-25498` (link copied toast), `3153-25568`
(shared), `2910-36926` (contacts permission off).

## Decision

### Routing — dialog becomes a page

`InviteFriendsDialog` is **replaced** by routed pages. Two routes are added.

- `/channels/:channelId/invite` — the friend selection page
- `/channels/:channelId/invite/link` — the invite link page (its own route)

Add the builders to `ROUTES.channels` (`apps/web/src/app/routes/paths.ts`), add the `<Route>`s in
`channels/index.tsx`, and export the pages from `pages/index.ts`. The entry points in
`ChannelRoomPage` (the button at line 401 today) and `ChannelSettingsPage` (line 174 today) change
from opening `useState` to `navigate()`.

The top header reuses the app's `PageHeader`
(`apps/web/src/app/ui/components/PageHeader.tsx`) for consistency with the other channel pages, not the
kit's `AppHeader` / `ModalTopBar`. The invite link page needs an X (close) affordance, so if
`PageHeader` has no close variant, add one.

### Behaviour per platform

- **Native**: the invite button opens the friend selection page (the device's contacts, multi-select).
- **Web**: no access to device contacts, so the friend list is not populated and the flow enters the
  **invite link** path instead.

### The invite link flow (where the URL comes from)

There is no backend endpoint that returns a general-purpose channel invite link. The URL exists only as
the `Location` deeplink in a `requestInvite` response, which requires a name and a phone number. So the
flow is:

1. Tap the link icon in the friend selection page's search bar (native), or the web entry point →
2. A **bottom sheet** for the name and contact appears (the role `AddFriendSheet` plays today) →
3. Fill it in and press share → the `requestInvite` network call →
4. Take the `Location` link from the response → show the URL on the **invite link page** →
5. "Share link" opens the OS share sheet (native) or copies to the clipboard (web). On copy or share,
   show a toast and update the button state ("✓ Shared").

### The friend selection counter — a plain selection cap of 100

`10/100` means **at most 100 selected at once** — a plain selection cap, unrelated to the current
member count, unlike today's `memberCount + selection ≤ 100` capacity guard. At 100, show the toast
"You can invite up to 100 people".

### Reusing the existing logic

`InviteFriendsDialog`'s contact fetching, the Korean phone number validation (`normalizeKoreanPhone`,
`isValidKoreanPhone`, `extractValidPhone`), the batch invite (one person = a single call, two or more =
a batch), and the `useCreateInviteBatch` / `useChannel` hooks are all reused as they are. Only the UI
shell is rebuilt as pages plus kit components.

### web-ui-kit, existing and new

- Reused: `SelectableUserItem` (a friend row), `SearchInput` (which already supports a right-hand link
  icon action), `Button` / `TextLink`, `ProfileAvatar`.
- **New (added to the kit)**: the horizontally scrolling row of selected avatar chips (each removable),
  and the invite link card (group avatar, name, the full URL, a copy icon).
- Icons: where the kit's `resources/icons` lacks one (the link icon, for example), pull the SVG from
  Figma and add it as a semantic component.
- The contacts-permission-off panel (screen 7) stays an app-level composition but takes the new design
  (a "Send an invite link" button with a chevron).

### Scope

- **In**: the seven screens and states, the routing change, rewiring both entry points, reconnecting
  the existing invite APIs (contact batch invite plus link creation and sharing), the i18n keys (`ko`
  and `en`), and the new kit components and icons.
- **Out**: a new backend endpoint dedicated to general-purpose channel invite links (the existing
  `requestInvite` remains the basis). Device contact access on the web (impossible).

## Alternatives

- **Keep the dialog and only add the page**: two invite UIs coexisting is confusing, and it contradicts
  the requirement ("not a popup"). Rejected.
- **The same friend selection UI on the web, sourced from a backend friend or member list**: finding
  and designing that source costs more than this round allows. Rejected (web = invite link).
- **The invite link as an overlay or modal**: it fits the X-close affordance but contradicts the "page"
  requirement and makes deeplink entry awkward. Its own route wins.
- **A new backend general-purpose channel invite link**: cleanest, but it depends on server work. This
  round works from `requestInvite` (name plus number).
- **Keep the capacity-aware counter**: Figma expresses a plain cap of 100, so the plain cap is adopted
  for display consistency.

## Consequences

- The invite flow becomes route-based, so deeplinks, the back button and transition animations all
  work naturally.
- `InviteFriendsDialog` is absorbed into the pages and becomes deletable, along with the test that
  mocks it (`ChannelSettingsPage.test.tsx`) and the code at both entry points.
- web-ui-kit gains reusable invite components (the selection chip row, the invite link card) for later
  screens.
- With a plain cap of 100, whether the room's capacity is exceeded is decided by the server; the client
  displays the selection count only.
- Because the invite link URL depends on `requestInvite` (name plus number), reaching the link screen
  always goes through the bottom-sheet input step. A pure "general group link" UX (a link with no
  input) is not offered until a backend endpoint exists.
- `PageHeader` may need a close (X) variant for the invite link page.
