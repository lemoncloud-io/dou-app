# Place creation and group room creation: rebuilt on web-ui-kit, plus post-create navigation, owner gating, images and limits

> **Naming note (2026-09-01):** the names this document uses — `*RemoteDataSource`,
> `RemoteGatewayBundle`, `*DomainGateway`, `remoteFactory`, `remote/data-sources/` — are **the names of
> the time**. The mapping to the names after the socket axis moved behind the `Socket` prefix is in
> [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#naming-history). This is a
> record, so the body is left as it was.

## Status

accepted

Decided: 2026-07-20

Related ADRs:
[[0012-place-profile-creation]](./0012-place-profile-creation.md) (the profile setup overlay — the visual template),
[[0013-home-screen-web-ui-kit-migration]](./0013-home-screen-web-ui-kit-migration.md) (the web-ui-kit-first principle),
[[0014-home-screen-figma-visual-refinement]](./0014-home-screen-figma-visual-refinement.md) (the lineage of the home revision)

## Context

Figma produced revised designs for **place creation** (node `3036-12309`) and **group room creation**
(node `3135-23390`). Both are full-screen with an X to close, and their structure is nearly identical —
title and subtitle, a circular avatar (image picker with a `+` badge), a name `TextField` with an
0/20 counter, and a full-width `Done` button at the bottom.

| Screen                          | Title / subtitle                                                                                                          | Avatar label / field              | Placeholder / helper                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| Place creation (`3036-12309`)   | "Create a place and start talking" / "A place is where you create and manage chat rooms inside a cloud."                    | Place photo [optional] / \*Place name | "Enter a name" / "Use 20 characters or fewer."                                              |
| Group room creation (`3135-23390`) | "Create a group room and start talking" / "A group room is where the right people talk about one thing."                  | Room photo [optional] / \*Room name  | "e.g. Summer trip, Family, Project A" / "Pick a name that makes the room's purpose obvious." |

**This is a rebuild, not new work.** Both creation flows exist already, on legacy UI, and both fall
short of the requirements:

| Item                | Where it stands                                                                                       | The gap                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Place creation      | `CreatePlaceDialog` (legacy shadcn `@chatic/ui-kit`), `useCreatePlace.createPlace({ name })`            | Not web-ui-kit. On success it **discards** the returned `MySiteView` and just closes → no site switch. No image. |
| Group room creation | `CreateChannelDialog` (legacy), `useCreateChannel.createChannel({ stereo, name })`                      | Not web-ui-kit. On success it shows **a toast only** → no navigation to the channel. No image.            |
| The visual template | `PlaceProfileCreateDialog` (web-ui-kit, `ModalTopBar` + `ProfileAvatar` + `TextField` + `FloatingButton`) | That is **profile onboarding, not creation** (ADR-0012). Its layout matches Figma → the reference for the rebuild. |

What the survey settled:

- **web-ui-kit has enough material.** `ModalTopBar`, `TextField` (`maxLength` plus the counter plus
  `enforceMaxLength={false}` for the over-limit state), `FloatingButton` (loading / disabled),
  `ProfileAvatar` (`onSelect` plus the `+` badge), `Toast` and `AlertDialog` all exist. Image resizing
  reuses `resizeImageToBase64` (`@chatic/shared`). **Against the current Figma no new kit component is
  needed** (there is no textarea and no select). The image glyph `IconImage` is already in the kit
  (`db8f2b6a`).
- **The image API.** `place.create` **does** support `thumbnail?` in its body (`PlaceBodyData`), but
  `useCreatePlace` / `PlaceRepository` pass only `name`. `channel.create`
  (`ChannelCreateRequestData`) currently types only `{ stereo, name }` (thumbnail exists on
  `ChannelUpdateRequestData` alone), and **this work assumes `channel.create` accepts `thumbnail` and
  implements it as a single step** (confirmed by the user, 2026-07-20). That presumes the socket types
  and the backend take `thumbnail` in the `channel.create` body; if the type is not exposed yet,
  extending `ChannelCreateInput` comes first.
- **The owner signal.** The global `userRole` is only `guest` / `user` and says nothing about cloud
  ownership. But `DomainCloud.cloudType` (`'invited' | 'owner'`) exists as **the cloud ownership
  signal** (`mappers.ts:222`, `CloudRepository.ts:32`). Today's gating is
  `canCreatePlace = !isGuest && isCloudActive` and `canCreateChannel = true`, with no notion of an
  owner.
- **Conflicting limit constants (to be cleaned up).** `apps/web/src/app/utils/consts.ts` holds
  `MAX_PLACES=5`, `MAX_CHANNELS_PER_PLACE=5` and `GUEST_MAX_CHANNELS=1`, and **nothing imports them —
  dead code**. The live values are separate literals inside `useUserPermissions.ts`
  (`MAX_CHANNELS_PER_PLACE=100`, `GUEST_MAX_CHANNELS=3`), which contradict them.
- **An unused prototype.** `channels/pages/CreateChannelPage.tsx` (route `/channels/create`) is a
  prototype with a hardcoded invite code (`'ABC123'`) that nothing in the app navigates to. It has a
  public/private toggle, and the revised Figma has no visibility toggle at all.

## Decision

Rebuild both creation screens **as dialogs, in place**. Replace `CreatePlaceDialog` and
`CreateChannelDialog` with `@chatic/web-ui-kit` full-screen slide-up overlays (the
`PlaceProfileCreateDialog` pattern), and keep the existing entry points on HomePage. No new routes.
This inherits the web-ui-kit-first principle (ADR-0013) — no colour hex or icon goes into the screen
directly, and a missing primitive is defined in the kit first (nothing is missing in this scope).

**In scope**

- **(1) Rebuild place creation.** Rewrite `CreatePlaceDialog` on web-ui-kit against Figma
  `3036-12309`: the name `TextField` (max 20, error past the limit) plus image selection
  (`ProfileAvatar` plus a hidden file input plus `resizeImageToBase64`).
- **(2) Rebuild group room creation.** Rewrite `CreateChannelDialog` on web-ui-kit against Figma
  `3135-23390`, with the same name and image form. Visibility keeps today's default
  (`stereo: 'private'`), since the revised Figma has no toggle.
- **(3) Navigate after creation.**
    - Place done → **switch sites** to the new site id that `createPlace` returned (`switchSite(newId)`
      from `useSwitchPlace` / `runtime/useSiteSwitch`), then close the overlay.
    - Group room done → **go to the channel** with the returned `DomainChannel.id`
      (`navigate(ROUTES.channels.room(id))`).
- **(4) Owner gating.** Add the notion of cloud ownership to `useUserPermissions` and narrow
  `canCreatePlace` and `canCreateChannel` to **`cloudType === 'owner'`** (on top of the existing
  `!isGuest && isCloudActive`, excluding the relay cloud). The server is the final authority, so the
  client's role is to show or hide the entry point and pre-validate.
- **(5) Wire the images (single step on both).**
    - Place: thread `thumbnail` through `useCreatePlace` / `PlaceRepository` so `place.create` sends it
      in one call.
    - Group room: assume `channel.create` supports `thumbnail` and send `{ stereo, name, thumbnail }`
      **in one call**. Where needed, add `thumbnail` along the `ChannelCreateInput` / repository path
      (`useCreateChannel`, `ChannelRepository`, `ChannelRemoteDataSource`). No create-then-update in
      two steps.
- **(6) Limits.** At most 5 places, and at most 100 group rooms per place. The creation (+) entry point
  is **always visible**, and an attempt past the limit is stopped with **an explanatory toast**
  (consistent with today's reject-toast pattern in `handleCreatePlace`). The limit constants are
  unified in `useUserPermissions` (or right beside it), and the dead, conflicting values in
  `utils/consts.ts` are cleaned up.

**Out of scope**

- Changes to data flow, sync registration or the unread model (inherited from ADR-0013).
- Changing the group room PRO gate — today's `planTier === 'pro'` gate (from the ADR-0013 line) stays,
  with the owner gate layered on top.
- Making unbuilt features work, such as 1:1 chat creation or search.
- Server-side owner and limit enforcement (the backend's job). The client does UX gating and
  pre-validation only.

## Alternatives

- **New route pages (`/place/create`, `/channels/create`).** The unused `CreateChannelPage` prototype
  could be recycled, but every existing entry is a HomePage overlay and Figma draws a full-screen
  overlay, so a route would be out of place. No deeplink requirement, so rejected.
- **Keep today's owner test (non-guest plus an active cloud) and defer to the server.** The requirement
  says "owners only" and the exact signal (`cloudType==='owner'`) already exists, so narrowing the
  entry point to owned clouds is more accurate UX. Rejected.
- **Two steps for the group room image, create then update.** Since the current types have no
  thumbnail on `channel.create`, applying it with an update afterwards was considered, but partial
  failure (the room exists, the thumbnail is missing) is messy and it adds a round trip. Rejected in
  favour of assuming `channel.create` takes a thumbnail and doing it in one step (user decision).
  Dropping the group room image entirely (name only) was also rejected, because Figma explicitly shows
  "Room photo".
- **Hide or disable the (+) button at the limit.** Cleanest, but consistency with the existing
  reject-toast pattern and an always-visible entry point won. Rejected.
- **Use the `utils/consts.ts` constants as they are.** Dead code whose values contradict the
  requirement (100 rooms / 5 places vs. 5 rooms), so they cannot be trusted. Unify, then delete them.

## Consequences

- **Legacy UI goes.** `CreatePlaceDialog` and `CreateChannelDialog` move from legacy `@chatic/ui-kit`
  to web-ui-kit, removing two shadcn dependency points. The unused `CreateChannelPage` and the
  `/channels/create` route become cleanup candidates (a visibility-toggle prototype that contradicts
  the current Figma).
- **Owner gating changes the entry points.** Narrowing `canCreatePlace` / `canCreateChannel` to
  `cloudType==='owner'` changes when HomePage shows the Place `+` and the Chat `Create group room`
  item. In an invited cloud the creation entry points disappear. `useUserPermissions.test.ts`
  expectations need updating.
- **The group room image presumes `channel.create` takes a thumbnail.** One step means no partial
  failure handling. But `ChannelCreateRequestData` has no thumbnail today, so the socket API types and
  the backend have to accept it first. Before starting, check whether the `channel.create` body
  supports `thumbnail`; if it does not, extending the type or agreeing it with the backend is a
  blocker.
- **The limit constants get one home.** 5 places and 100 group rooms live in a single source, and the
  conflicting values in `utils/consts.ts` are removed, so a future limit change happens in one place.
- **`PlaceProfileCreateDialog` is not touched.** It is profile onboarding, not creation (ADR-0012), so
  it serves as a visual reference only and its logic stays separate.
- **Icons and assets.** The image glyph reuses the existing `IconImage`. If the kit's existing icons
  (`IconUsers` and friends) cannot supply the default group room avatar glyph, pull the asset from
  Figma into `resources/` — the only case that needs a new export.

## Next steps

Continue into the spec phase (Phase A) of [[dev-2_implement]]. Before starting, confirm whether the
`channel.create` body supports `thumbnail` (if not, extending `ChannelCreateInput` or agreeing it with
the backend comes first), and settle where the limit constants live in the spec.
