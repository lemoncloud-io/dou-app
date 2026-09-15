# ADR-0031: A route-based place settings hub

> Status: Accepted · Decided: 2026-07-27

## Context

Add place settings to `apps/web/src/app/features`. The requirements:

- Components come from `@chatic/web-ui-kit`, and anything missing is defined in that library first.
  Icons are pulled as resources into the `web-ui-kit` icon convention (`resources/icons`) as well.
- Apply the improved UI. (In this session Figma MCP was unauthenticated, so the visual detail could not
  be checked directly — the pixel work needs Figma authentication first.)
- The entry point: the dropdown that opens from the home profile avatar.
- Editing the place name and the place profile (image) is **owner only**; a non-owner sees them
  **disabled**.
- This round: **place settings, place profile settings, place user profile settings and chat room
  sorting**.

The survey found that much of this already exists:

- **Place entity (name, thumbnail) editing logic and API**: `useUpdatePlace({sid,name,thumbnail})` →
  `PlaceRepository.updatePlace` (optimistic with rollback). The screen `PlaceInfoPage` exists but nothing
  navigates to it — an orphan page — and its owner guard is inverted
  (`if (place.isOwner) navigate(-1)`). Ownership comes from the server as `place.isOwner`.
- **The place user profile (nickname, photo, scoped `${sid}@${uid}`)**: already complete through
  `PlaceProfileEditDialog` plus the shared form `PlaceProfileFormDialog` plus
  `setMyProfile({nick,thumbnail})`. It opens from "Profile" in the home dropdown.
- **The entry dropdown**: `HomePage.tsx`'s `profileMenu` (Profile / Notifications / Settings), built on
  the Radix `DropdownMenu` from `@chatic/ui-kit`. `isCloudOwner` and `selectedSiteId` are already
  available there.
- **Materials for the sorting UI**: `BottomSheet` plus `SheetOption` (radio rows), and a complete client
  preference store — `preferenceKeys.ts` plus `usePreferenceStore` (localStorage `chatic-*`). Today chat
  room sorting is fixed at "most recent activity".

## Decision

### Entry and screen structure — a route-based settings hub

- Add a **"Place settings"** item to the home profile dropdown (`profileMenu`), which navigates to a
  **settings hub route page** (a route page, not a dialog).
- The hub is **a single page** whose `MenuCard` plus `ListRow` list leads into each detail page — the
  hierarchical shape of the iOS Settings app:
    - Place settings (name, profile image) — a detail page
    - Place user profile settings — a detail page
    - Chat room sorting — a detail page (choosing the sort key)
    - Place notifications — out of scope this round (unbuilt). It may appear as a placeholder or disabled
      row.

### Place settings (name, image) — owner only

- **Reuse** the existing `PlaceInfoPage` logic (`useUpdatePlace`, the thumbnail's
  `resizeImageToBase64(150)`, a 1–20 character name), wire it as a route under the hub, and **fix the
  inverted owner guard**.
- Ownership uses the server-provided **`place.isOwner`**. A non-owner sees the hub row and the editing
  controls **disabled**, not hidden.

### Place user profile — both a page and a popup

- The dropdown's **"Profile"** keeps opening the existing **full popup dialog**
  (`PlaceProfileEditDialog`).
- "Place user profile" **inside the settings hub** is exposed as a **route page**.
- The two entry points **share** the form body (`PlaceProfileFormDialog`) and the `setMyProfile` save
  logic. Only the container differs (dialog or page).

### Chat room sorting — pick a key, stored on the client

- The settings page **picks a sort key** (not a manual drag order). The keys offered:
    - **Most recent activity** (the default, today's behaviour)
    - **Unread first** (rooms with unread messages move to the top)
- The selection UI is `SheetOption` / radio rows.
- The sort state is **stored in client localStorage, per place**. Add a placeId-scoped key to the
  `preferenceKeys.ts` registry and read and write it through `usePreferenceStore`. No server sync
  (per device).
- The sorting `useMemo` in the chat room list (`ChannelList`) reads that preference and applies it.

### Components and icons

- Every screen is composed from `@chatic/web-ui-kit`: the hub and its rows from `MenuCard`, `ListRow`,
  `SectionHeader` and `GroupLabel`; the forms from `TextField` and `ProfileAvatar`; sorting from
  `BottomSheet` and `SheetOption`; the top bar from `ModalTopBar`; the bottom CTA from
  `FloatingButton`.
- The kit has no dropdown, so the Radix `DropdownMenu` from `@chatic/ui-kit` is used directly (the
  existing convention).
- Where a component the kit lacks is needed, **define it in `web-ui-kit` and use it from there**.
- A new icon is added to `resources/icons/index.ts` as a one-line lucide re-export, or, for a custom
  Figma glyph, as an SVG component following the `IconGroup.tsx` pattern.

### Out of scope (not this round)

- **Place chat room management** — follow-up work.
- **Place notifications** — unbuilt.
- Server sync for sorting, and manual drag reordering (@dnd-kit).

## Alternatives

- **Reuse the existing dialog pattern instead of routes**: the smallest change and consistent with what
  exists. But the user explicitly chose route-based settings pages (for deeplinks, the back button and
  hierarchical navigation). → Rejected.
- **Go straight from the dropdown to each item's route, with no hub**: the same number of screens, but
  the dropdown bloats as settings accumulate. A hierarchical hub scales better. → Rejected.
- **Move the user profile entirely to a route page (removing the dialog)**: more consistent, but it loses
  quick profile editing (the full popup) from home. Sharing the form body keeps both without duplication,
  so both are kept.
- **Sorting as a manual drag order**: it needs `@dnd-kit` and storing an order array. The requirement is
  "remember the sort method", so picking a key is the smaller answer. → Rejected (possible later).
- **Store sorting on the server (place.order / join order)**: syncs across devices, but it needs backend
  fields and work. Client localStorage is the smallest path. → Rejected.
- **Reach sorting from a BottomSheet in the chat room list header**: natural to reach from near the list,
  but the hub policy of gathering settings in one place, and the user's choice, put it inside the settings
  page. → Rejected.

## Consequences

**What is gained**

- Most of this reuses existing assets (`useUpdatePlace`, `setMyProfile`, `PlaceProfileFormDialog`, the
  `PlaceInfoPage` logic, the preference store, the kit components) → a minimal new surface.
- The orphan `PlaceInfoPage` gets an entry point, and the inverted owner guard is fixed.
- Settings gather into a hierarchical hub, so adding items later (notifications, room management) is
  easy.
- The sort preference persists per place.

**Trade-offs accepted**

- Entry to the user profile forks into two containers, dialog and page → managed by sharing the form
  body, but the container branch is new code.
- Sorting is per device (localStorage), so it does not sync between devices.
- New routes mean extra routing and navigation wiring (compared with a dialog).
- With Figma unchecked, the visual detail (spacing, colour, the shape of new components) has to be
  re-confirmed after authentication during implementation — this ADR settles only the structure and the
  data.

## Next steps

This ADR feeds the spec phase (Phase A) of `dev-2_implement`.
