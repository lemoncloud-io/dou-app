# ADR-0026: Bring the self chat channel type into web

> Status: Accepted · Decided: 2026-07-20

## Context

The channel feature in `apps/web` already handles "self chat" partially through `stereo === 'self'`,
but the type needs tidying up for the recent Figma redesign (the channel room refinement, following
ADR-0021). What the survey found, and what is required:

**What already exists**

- Self detection: `useChannel.ts:13` — `isSelfChat = stereo === 'self'`
- The room hides read status: `ChannelRoomPage.tsx:85` —
  `showReadReceipt = !isSelfChat && activeCount >= 2`
- The room header uses `kind='direct'`, the self empty state (pen icon plus guidance), and no invite
  dialog
- The whole pipeline below join.nick is in place — the `join.update` gateway (body
  `{ id, nick?, notify?, role? }`), `JoinRepository.updateJoin` (`repositories/JoinRepository.ts:125`,
  which handles nick and resolves the composite id from channelId/userId), exposed through
  `useRuntimeRepositories().join`

**What is inconsistent or missing**

1. Self detection disagrees — the home list decides with `memberNo === 1`
   (`ChannelList.tsx:44`), while the channels feature uses `stereo === 'self'`.
2. For a self chat the room header ignores `channel.name` and shows the fixed label
   `channelList.selfChannel` (`ChannelRoomPage.tsx:349`) → renaming never shows up in the header.
3. Renaming a self channel is blocked in settings (`ChannelSettingsPage.tsx:145-146` — the name row is
   not clickable).
4. web's `useChannelMutations` does not pull the `join` repository → there is no app-level mutation
   that writes join.nick (desktop-web's `setChannelNotify` does use `joinRepository.updateJoin`).
5. Nothing reads or writes `$join.nick` at all.

**Figma references (DoU / node)**

- Room empty state `3185-13109`, room with messages `3186-13530`, room info (settings) `3185-13278`,
  the rename input case `3165-26764`, the home list item `3209-14565`

## Decision

### In scope

1. **Unify self detection on `stereo === 'self'`.** Remove the `memberNo === 1` test from the home
   `ChannelList` and replace it with `stereo === 'self'`. (The self display, badge and member-count
   pill logic follow the same test.)

2. **A self channel's name is stored and shown through `$join.nick`**, not the channel's `name`.
    - Storing: use the `join.update` path (`JoinUpdateRequestBody.nick`). web reuses
      `useJoinMutations().updateJoin({ channelId, userId, nick })`, introduced in ADR-0025 — the same
      hook as the notification toggle. `userId` comes from `channel.$join?.userId`, falling back to the
      session uid.
    - Showing (room header, home list, the settings name row): **`$join.nick || the site profile
      nick`**. Use the custom nick where there is one; otherwise fall back to **the active site
      profile's name** (`useMyProfile().profile?.nick`). The account (user record) name is not used,
      because it can be a raw id or UUID. With neither, use the `channelList.selfChannel` label. In the
      home list, a self chat shows the `MY` badge plus this title (`3209-14565`).

3. **Renaming starts from the name row at the top of settings.** On `ChannelSettingsPage`, make the
   name row clickable for a self chat too, and open the rename UI. The input spec (`3165-26764`): name
   only, 20 characters maximum, a character counter (`8/20`), placeholder `Self Chat`, helper "Use 20
   characters or fewer." Self chat does not expose thumbnail editing (unlike a group's
   `UpdateChannelDialog`, this is name-only). Saving goes through the join.nick path from point 2.

4. **Read counts stay hidden.** A self room does not show the per-message unread count (ReadReceipt),
   which is already the case (`ChannelRoomPage.tsx:85`). Every read-related element — the count beside
   the time, `all_done` — stays hidden (Figma hides them).

5. **Apply the Figma UI.** Bring the room (empty and with messages), room info (settings), rename and
   home item screens — four, plus one — onto `@libs/web-ui-kit` components. For a self chat the settings
   screen (`3185-13278`) shows only "Room friends" (one owner) and hides the notification, add-member
   and leave sections. The room's ⋯ menu has a single item, "Room info" (settings).

6. **Components come from `@libs/web-ui-kit`.** Anything missing is defined there first. Icons use the
   semantic aliases in `resources/icons`, and a custom glyph is added there.

### Out of scope

- **Creating a self channel.** web has no UI or logic that creates one today (creation only ever sets
  `stereo: 'private'`). Self channels are assumed to exist already, server-side, and this round covers
  reading, renaming and using them.
- desktop-web (this work is limited to `apps/web`).
- Changing the home unread badge logic — a self chat naturally accumulates no unread, so it needs no
  special handling.

## Alternatives

- **Store the name in `channel.name`** (the same path as a group): rejected. By the user's decision a
  self chat's name is managed as the per-join nick (`join.update`), and the pipeline below is already
  built around nick.
- **Keep or unify detection on `memberNo === 1`**: rejected. A member count moves with state, and the
  requirement names "the self stereo" explicitly. `stereo === 'self'` is the stable single test.
- **Add renaming as its own item in the room's ⋯ menu**: rejected. Consistency with group settings
  wins — the name row at the top of settings is the entry point (even though the Figma settings screen
  has no name row).
- **Reuse the group's `UpdateChannelDialog` as is**: partly rejected. The save path (join.nick) and the
  layout (name-only with a counter, no thumbnail) differ, so a self branch or a dedicated editor is
  needed (the exact structure is settled in the spec phase).

## Consequences

- **What is gained**: self detection lands on a single test (`stereo === 'self'`), so home, the room
  and settings stop disagreeing. Renaming works through the join.nick path and shows up consistently in
  the header, the list and settings, and the Figma redesign is expressed in web-ui-kit components.
- **Trade-offs and follow-ups**:
    - Writing join.nick reuses the existing `useJoinMutations` (ADR-0025) — no new mutation.
    - The self rename path differs from a group's (channel name), so the editing UI branches —
      maintenance has to keep both in mind.
    - The fallback is settled as **the site profile nick** (`useMyProfile`); the account user name
      (possibly a raw id or UUID) is not used.
    - If web-ui-kit's `TextField` lacks the character counter and helper affordances, the library may
      need extending.
- Next step: this ADR feeds the spec phase (Phase A) of dev-2_implement.
