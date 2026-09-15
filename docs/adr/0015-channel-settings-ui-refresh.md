# Channel settings refresh — rebuild on web-ui-kit, plus a new profile detail and notification screen (UI only)

## Status

accepted

Decided: 2026-07-16

Partly superseded by [ADR-0019](0019-group-channel-settings-section-layout.md) — decisions #1 (the
chat room settings layout) and #4 (notifications in their own dialog) are replaced by the new group
room design (a sectioned list with an inline notification toggle). The rest (info editing, profile
detail, confirmation dialogs, the kick wiring) still holds.

## Context

The channel settings screens were redesigned in the DoU design (Figma file
`ViwLfjc5Eoq7BpEXFfFj3W`). Three screens are in scope — **chat room settings, chat room info editing
and profile detail** — plus the confirmation dialogs, the notification settings and the member-limit
notice that come with them.

Where the code stood before this work:

- **Chat room settings already exists** — `apps/web/src/app/features/channels/pages/ChannelSettingsPage.tsx`.
  The owner branch (`channel.isOwner` = `ownerId === myUid`), room renaming, invites, delete/leave and
  the member list (owner and MY badges) are all built; the new design is not applied.
- **Chat room info editing already exists** — `apps/web/src/app/features/channels/components/UpdateChannelDialog.tsx`.
  It is an **in-page dialog** rather than a full-screen route, and **thumbnail upload already works**
  alongside the room name.
- **Profile detail ("friend info") does not exist.** No component, no route, and `MemberListItem` is
  not clickable — entirely new.
- **There is no notification settings screen either** (an old stub was removed; see the README).

The backend constraint that shapes this: `ChannelRepository` has **no mutation for a per-member
nickname or for notification settings**. The writes that exist are `createChannel`, `updateChannel`,
`inviteChannel`, `leaveChannel` and `deleteChannel`.

**Kicking a member is possible through `leaveChannel`**, though: `ChannelLeaveRequestData` is
`{ channelId, userId? }`, so passing `userId` removes that member (omitting it leaves the room
yourself). Owner only. One caution: `leaveChannel` currently looks only at `channelId` and
**unconditionally evicts the channel from my local cache**, so a kick (another `userId`) needs a
branch that skips the eviction.

The reference Figma frames:

| Screen                            | node-id    | Notes                                              |
| --------------------------------- | ---------- | -------------------------------------------------- |
| Chat room settings (owner)        | 2935-23009 | Edit link · invite / notifications / delete · members |
| Chat room settings (member)       | 2935-22968 | Notifications / leave · owner crown badge · MY badge |
| Chat room info editing            | 2935-22413 | Room name (0/20) + room photo + Done                |
| Save toast                        | 2935-22761 | "Room info saved."                                  |
| Profile detail (member)           | 2935-23150 | Read-only name · ⋯ menu = Report                    |
| Profile detail (owner)            | 2935-23247 | Nickname edit + Done · ⋯ menu = Report, Remove friend |
| Delete room confirmation          | 2935-22403 | Cancel / Delete                                     |
| Leave room confirmation           | 2935-22411 | Cancel / Leave                                      |
| Over-100-member notice            | 2935-22396 | OK                                                  |
| Notification settings (app off)   | 2935-22356 | Banner plus the message toggle (off)                |
| Notification settings (app on)    | 2935-22376 | Message toggle (on)                                 |

## Decision

### In scope

1. **Restyle chat room settings** — rebuild the existing `ChannelSettingsPage` against the new Figma.
   The owner / member split **reuses `channel.isOwner` exactly as it is**; no new detection logic.
2. **Restyle chat room info editing** — keep the existing `UpdateChannelDialog` (name plus thumbnail)
   and change only its styling. Add the save-success toast.
3. **New profile detail ("friend info")** — built as an **in-page dialog**, following the
   `UpdateChannelDialog` pattern, with no new route. It opens from **tapping a member row** in
   settings.
    - The owner branch is **the room owner (`channel.isOwner`)**. The owner view (2935-23247) adds
      `Remove friend` to the ⋯ menu; the member view (2935-23150) has `Report` only. Both show the
      name read-only.
    - **Nickname editing is not built** — the backend does not support it, so there is no edit field
      and no `Done` button this round. The name is displayed only.
    - **`Remove friend` (kick) is wired for real** — owner only, through
      `leaveChannel({ channelId, userId })`. Add the branch that applies the cache eviction to a
      self-leave only (see the caution in Context).
4. **New notification settings** — built as an **in-page dialog**, opened from the `Notifications`
   action in settings.
5. **Restyle the confirmation dialogs** — bring the delete and leave `ConfirmDialog` copy and styling
   in line with the design.
6. **The over-100-member notice** — added as a client-side guard in the invite flow.
7. **Components come from `@chatic/web-ui-kit`** — anything missing is defined in the library first.
   Stateless, slot-based, i18n-agnostic label props, tokens, and a `*.test.tsx` plus `*.stories.tsx`
   alongside (inherited from ADR-0010 / ADR-0013).

### Not wired (UI only) — display and buttons, no data

With no backend method, these get **display and buttons only**, and local state may reset on reopen:

- **Notification settings** — the message notification toggle (local state only) and the app-
  notifications-off banner.
- **Report** — the button in the profile detail ⋯ menu.

(`Remove friend` is promoted to real wiring; **nickname editing is excluded as unbuilt** — see
decision 3.)

### Out of scope

- **Real data wiring** for per-member nicknames and notification settings (both need new backend and
  repository work).
- **The nickname editing UI itself** (edit field, Done button) — excluded this round for lack of a
  backend; follow-up.
- Other data-layer logic such as read computation. (The `leaveChannel` eviction branch needed for kick
  is the one exception, and it is in scope.)
- New URL routes — profile detail and notification settings are both dialogs.
- **The 1:1-chat-specific layout** (Figma 2957-10970 · 2970-13420 · 2970-13653 · 2970-12918 ·
  2970-13693 · 2948-30128 · 2988-10929 · 2987-10924). The sectioned-list settings, the inline
  notification toggle, the nickname-style profile and the place-aware leave are **specific to 1:1
  chat** and are out of scope. The 11 frames in the Context table are the standard this round is held
  to.

## Alternatives

- **New routes** (`/channels/:id/members/:uid` and friends) — better for deeplinks and the back
  button, but it needs new entries in `paths.ts` and new routing, and it is inconsistent with the
  existing info-editing dialog pattern. Dropped as a violation of minimal.
- **Full wiring for nicknames, kick and notifications** — the backend spec has to be agreed first, and
  the scope and schedule grow a lot. Kept UI-only, to be revisited in a follow-up ADR once the backend
  is ready.
- **Detecting the owner through `JoinStereo === 'owner'`** — it exists in the model, but the UI
  already uses `ownerId === myUid`, so it is unnecessary. The existing derivation stays.

## Consequences

- **What is gained**: three screens are brought into one consistent design, and the web-ui-kit
  inventory grows. Risk is low, because the proven logic — the owner branch, info editing, invite,
  delete, leave — is reused.
- **The trade-off**: the unwired buttons (report, remove friend, nickname editing, notifications) can
  read as "UI that does nothing", so expectations have to be managed with a toast or an explicitly
  disabled state. UI-only toggles and fields hold local state only and reset on reopen. These points
  get revisited when the backend is ready.
- Related: [ADR-0010](0010-chat-screen-webuikit-rebuild.md) (the principles for rebuilding the chat
  room on web-ui-kit), [ADR-0013](0013-home-screen-web-ui-kit-migration.md) (the home migration
  pattern).
