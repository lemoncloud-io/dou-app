# ADR-0023: Redesign the channel detail dialogs (room info, member profile), and introduce a personal room name (join.nick)

> Status: Accepted · Decided: 2026-07-20

Related ADRs:
[[0014-home-screen-figma-visual-refinement]](./0014-home-screen-figma-visual-refinement.md) (its "member nickname editing is out of scope" position — partly reversed here),
[[0015-channel-settings-ui-refresh]](./0015-channel-settings-ui-refresh.md) · [[0019-group-channel-settings-section-layout]](./0019-group-channel-settings-section-layout.md) (the channel settings base),
[[0020-place-profile-edit-dialog]](./0020-place-profile-edit-dialog.md) (the profile editor being reused),
[[0021-channel-room-figma-refinement]](./0021-channel-room-figma-refinement.md) (the channel room Figma work that came first)

## Context

Refine **the two dialogs that open from the channel settings screen** in
`apps/web/src/app/features/channels` against the revised Figma. Components come from
`@chatic/web-ui-kit` first, a missing primitive is defined in the kit, and Figma-only icons are pulled
as resources.

The target screens (two dialogs, five nodes):

1. **The room info dialog** — `UpdateChannelDialog`
    - Owner: [3164-14803](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3164-14803&m=dev)
    - Invitee: [3164-14836](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3164-14836&m=dev)
2. **The member (friend) profile dialog** — `MemberProfileDialog` (opened by tapping a member row in
   channel settings)
    - Owner as viewer: [3177-13100](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3177-13100&m=dev)
    - Invitee as viewer: [3177-13312](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3177-13312&m=dev)
    - My own profile: [3186-24788](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3186-24788&m=dev)

### Where the code stands (survey)

- **Room info**, `UpdateChannelDialog`
  (`apps/web/src/app/features/channels/components/UpdateChannelDialog.tsx`)
    - A non-owner gets `readOnly`, which makes **everything** read-only (the photo picker and the save
      button are hidden). The name field is read-only too.
    - Saving is owner-only: `useChannelMutations().updateChannel({ name, thumbnail })`. There is no
      character counter, and the hex (`#B0EA10`) is used directly.
- **Member profile**, `MemberProfileDialog`
  (`apps/web/src/app/features/channels/components/MemberProfileDialog.tsx`)
    - A back arrow at the top plus a `⋯` **dropdown** (report, remove). The name is read-only. A
      comment says "nickname editing is out of scope (ADR-0014)".
    - Removing (kick) is limited to an owner viewer: `leaveChannel({ channelId, userId })`.
- **Display wiring**: `useChannel` (`apps/web/src/app/features/channels/hooks/useChannel.ts`) exposes
  the room name **straight from** `channel.name`, with no join.nick merge.

### Backend capability (survey)

- `JoinRepository.updateJoin` ([libs/data/.../JoinRepository.ts:125](../../libs/data/src/repositories/JoinRepository.ts))
  wraps the `join.update` action. Its input is `{ channelId?, userId?, id?, nick?, notify? }` — it
  applies **`nick` (text) and `notify` only, and has no thumbnail field**. Without an explicit id it
  resolves the join from the local cache by `channelId + userId`. No app hook wraps this method yet.
- The profile editors `PlaceProfileFormDialog` / `PlaceProfileEditDialog`
  (`apps/web/src/app/features/home/components/PlaceProfileFormDialog.tsx`) are already finished on the
  new design and the kit through ADR-0020 (`ProfileAvatar`, `TextField`, `ModalTopBar`,
  `FloatingButton`, `Toast`, `AlertDialog`).

### The visual spec settled from Figma

- **Room info (owner)** — title "You can set the room name". The avatar is **editable** (camera / ＋
  badge). A name field with a `0/20` counter and the hint "Use 20 characters or fewer."
- **Room info (invitee)** — the same title plus the **subtitle "The room name you set is shown only to
  you."** The avatar is **read-only** (the owner's thumbnail, with the caption
  `<the room name the owner set>` beneath). The name field **is editable** (placeholder
  `<shown as the room name the owner set>`) → my personal room name.
- **Member profile** — not a `⋯` dropdown but a full popup with **an X at the top, the avatar, and an
  inline list under the name**. The frame names `#owner` / `#invitee` refer to **the viewer's** role.
    - Viewer = owner: `Friend settings` · `Remove` · `Report`
    - Viewer = invitee: `Report`
    - My own profile: `Profile settings`
    - (The list reuses the generic "chat list" component, so Figma does not define where
      `Friend settings` / `Report` lead or what they do.)

## Decision

Apply the revised Figma, **web-ui-kit first**. Inherit the data flow, the member source and the
kick/leave/delete paths from ADR-0015 / 0019, and change only presentation and what can be edited. No
hex or icon goes into the screen directly; a missing primitive is defined in the kit.

### 1. The room info dialog — two modes, owner and invitee

Replace the single `readOnly` branch with **two modes by role**.

- **Owner mode**: the avatar and the name are editable →
  `updateChannel({ name, thumbnail })` (today's path, unchanged). Add the character counter and hint.
- **Invitee mode**: show the subtitle, make the **avatar read-only** (the owner's thumbnail plus the
  caption), and make the **name editable → the new `updateJoin({ channelId, nick })`**. No thumbnail
  (matching what the backend supports).
- Initial values: the invitee's name field prefills from my current join.nick if there is one, with the
  owner's room name as the placeholder.

### 2. Merge the personal room name (join.nick) on the client

Merge on the client so that a `join.nick` an invitee saves **shows up as the room name**. Wherever the
room name is displayed — the channel settings header row, the home channel list, the room header —
**my join.nick takes precedence over `channel.name`**. The merge lives in the derivation layer
(`useChannel`, a view model or a channel-name selector) so that consumers do not each repeat it.

### 3. The member profile dialog — a full popup with an inline list, branching on the viewer's role

Remove the `⋯` dropdown and replace the layout with **an X at the top, the avatar, the name and an
inline list**. The items branch on the viewer's role:

- Viewer = owner, target = another member: `Friend settings` (held) · `Remove`
  (`leaveChannel({channelId,userId})`, as today) · `Report` (UI only)
- Viewer = invitee: `Report` (UI only)
- Target = me: `Profile settings`, on its own

### 4. `Friend settings` and `Report` stay UI only

- **`Report`**: unbuilt, as today — the row shows, and a tap raises a toast (no backend wiring).
- **`Friend settings`**: **stays held** (the row shows and raises a comingSoon toast). The design was
  settled in a later discussion (2026-07-20): a screen where an owner gives a friend **a name visible
  only to themselves** ([Figma 2970-13653](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=2970-13653&m=dev) /
  [2970-12918](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=2970-12918&m=dev), the
  same layout as the invitee room info screen).
  **The blocker**: no backend field holds a per-viewer alias. `JoinModel.nick` is that member's own
  personal room name (a shared join), and `profile.set(target)` is that member's global profile, so
  neither means "only to me". Member names are also resolved from `profile.nick`
  (`apps/web/src/app/features/channels/hooks/useChannelProfiles.ts`). By the user's decision this waits
  for **backend per-viewer alias storage (or device-local storage) as separate work**.

### 5. `Profile settings` reuses the existing `PlaceProfileEditDialog`

Tapping `Profile settings` in my own profile view **opens ADR-0020's `PlaceProfileEditDialog` as it
is** (the per-place profile nick and photo, `setMyProfile`). No channel-specific editor is built.

### Scope

- **In**: points 1–5, bringing Figma-only icons into the kit, defining missing primitives there, a new
  app hook wrapping `updateJoin` (extending `useChannelMutations` or adding `useJoinMutations`), and
  the related i18n keys and tests.
- **Out**:
    - Actually wiring the channel notification (notify) toggle — possible through
      `join.update.notify`, but **separate work** (it stays UI-only, inherited from ADR-0015 / 0019).
    - A backend for `Report`, and real behaviour for `Friend settings`.
    - Changes to data flow, the member source, kick/leave/delete or the sync registration model.

## Alternatives

- **Keep the invitee fully read-only** — the smallest change. Rejected, because Figma explicitly shows
  the invitee's name input and `join.update.nick` exists.
- **Build `Friend settings` as a personal alias right away** — symmetric with the "shown only to you"
  room name pattern, but it contradicts placing it owner-only, and who the name is visible to is
  undecided. Held by the user's decision.
- **Hide the `Friend settings` row entirely** — showing the row is more faithful to Figma, which is the
  point of the exercise. "Held (visible, no-op)" was chosen by the user.
- **A channel-specific profile editor** — a twin of ADR-0020's editor. Rejected in favour of reuse.
- **Split join.nick display into follow-up work (save only)** — saving a nick that shows up nowhere is
  pointless. Display wiring is included.

## Consequences

- **ADR-0014's "member nickname editing is out of scope" position is partly reversed.** An invitee gets
  a personal room name through `join.update.nick`, and the related comments and assumptions in
  `MemberProfileDialog` need updating (the member profile name itself stays read-only; only the room
  name becomes personal).
- **The `join.nick` merge affects display everywhere.** Every consumer that shows a room name has to
  show the personal one consistently, so the merge lives in the derivation layer and every place a
  channel name appears has to be checked.
- **A new app hook is needed.** Nothing wraps `updateJoin` today, so one is added. The optimistic write
  is already handled by `JoinRepository`.
- **`Friend settings` and `Report` are visual only.** Both rows appear and neither works — make it
  clear to QA and users that they are visible but unbuilt, so nobody is misled.
- **The notify toggle stays UI only.** Wiring it through `join.update.notify` is now possible, but it
  is out of scope here and remains a follow-up candidate.
- **Kit first.** The avatars, inputs, lists and top bars of both dialogs are rebuilt on kit primitives
  (`ProfileAvatar`, `TextField`, `ModalTopBar`, `ListRow`), with anything missing defined in the kit, so
  inline hex and icons go away.

## Next steps

This ADR feeds the spec phase (Phase A) of [[dev-2_implement]]. Every item is ready to start; nothing
is unresolved.
