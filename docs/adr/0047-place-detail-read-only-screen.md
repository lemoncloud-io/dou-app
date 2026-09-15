# ADR-0047: Add a read-only "place info" screen, and rename the existing edit screen to `edit`

> Status: Accepted (partially amended) · Decided: 2026-08-07
> · **Amendment**: [ADR-0074](./0074-place-introduction-text.md) reversed the exclusion of the intro text
> (`desc`) discussed in §Scope below. The rest of this decision remains in effect.
> Related: [ADR-0045](./0045-relay-default-place-scoping-profile-step-and-avatar-unification.md)
> (default-place relay scoping · avatar unification) ·
> [ADR-0031](./0031-place-settings-hub.md) (place settings hub · `isOwner` authority) ·
> [ADR-0013](./0013-home-screen-web-ui-kit-migration.md) (web-ui-kit first)

## Context

Figma defines four variants of a "place info" screen — a **read-only** screen showing the place's avatar,
its name, its creation date, and owner info (avatar + owner badge + name).

| Figma node                                                                               | Condition         | Name label           | Bottom action           |
| ---------------------------------------------------------------------------------------- | ----------------- | -------------------- | ----------------------- |
| [3769-34116](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3769-34116) | relay + non-owner | Invited place's name | none                    |
| [3769-34207](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3769-34207) | relay + owner     | Place name           | Manage reports          |
| [3692-10303](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3692-10303) | cloud + non-owner | Invited place's name | Leave place             |
| [3700-11813](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3700-11813) | cloud + owner     | Place name           | Manage reports + Delete |

Observed constraints and facts:

1. **The name is already taken.** The current `PlaceInfoPage` is a screen that **edits** the name and photo
   (`apps/web/src/app/features/place/pages/PlaceInfoPage.tsx`), and it already occupies the
   `/place/:placeId/settings/info` route. The settings hub calls it "Place profile". Figma's "place info" and
   the code's `Info` refer to two different things.

2. **The relay/cloud branching lever already exists.** `HOME_PLACE_ID = '0000'` / `isDefaultCloud`
   (`apps/web/src/app/utils/resolvePlaceDisplayName.ts`) already handles identifying the default place (DoU
   Home) and its display-name branding (the ADR-0045 line of work).

3. **Most of the needed UI parts already exist.** `ProfileAvatar glyph="place"` (the default avatar = Figma
   3408-27536 = the `defaultPlaceAvatar` asset), `StatusBadge variant="owner"` (owner badge), `MenuCard` /
   `ListRow`, `PageHeader`. The one genuinely new resource needed is the **DoU Home ghost avatar**
   ([3769-34384](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3769-34384)).

4. **Data availability is unverified.** `createdAt` · `ownerId` · `owner$` exist on `MySiteView` by type, but
   whether the `user.mysite` response actually carries these fields has not been confirmed. Under DoU's
   semantics, the owner's display name is not the account profile but the **place profile** (a per-place
   nickname/photo).

5. **`ROUTES.place.detail` has no production caller.** Only `paths.test.ts` references it, and the
   corresponding route `/place/:placeId` currently renders the edit screen.

## Decision

### 1) Rename: editing becomes `edit`, the new read-only screen becomes `detail`

- The existing `PlaceInfoPage` becomes **`PlaceEditPage`**, and its route `settingsInfo` becomes
  **`settingsEdit`** (`/place/:placeId/settings/edit`). The settings hub's "Place profile" row points here
  (current behavior kept, owner-only gate kept too).
- The new read-only screen is **`PlaceDetailPage`**, route **`settingsDetail`**
  (`/place/:placeId/settings/detail`).
- The idle route `/place/:placeId` (= `ROUTES.place.detail`) renders `PlaceDetailPage`. Name and substance
  line up for the first time, and there is no production caller to break.

### 2) Branching: label follows `isOwner`, default avatar follows relay/cloud

The four Figma variants are the product of two axes, and each axis decides a different thing.

- **The `isOwner` axis** → the name label. Non-owners see "Invited place's name", owners see "Place name".
  The server's `isOwner` is the authority (ADR-0031).
- **The relay/cloud axis** → the fallback avatar when there's no thumbnail. DoU Home (`HOME_PLACE_ID` /
  `isDefaultCloud`) gets the ghost illustration; ordinary places keep the existing `defaultPlaceAvatar`. The
  display name keeps reusing the existing `resolvePlaceDisplayName` ("DoU Home" branding).
- **~~Showing owner info on the relay screen~~ → planning decision (2026-08-07):** relay has only the one
  default place, so "invited into somewhere" doesn't apply. The relay screen is pinned to the owner variant
  (Figma 3769-34207), and that variant **drops the creation-date and owner-info rows entirely**. The name
  label uses "Place name" even without `isOwner` (an explicit exception, not a side effect of missing
  fields). Measurements show the date does in fact come back for relay too, but the design keeps it hidden
  there regardless — this is a decision independent of data availability.

### 3) Owner info comes from `ownerId` + a place-profile lookup

Observe `profile.observeItem('${placeId}@${ownerId}')` keyed by `place.ownerId`, backed by `refreshItem`.
The per-place nickname/photo is the correct value to show here, and the channel member list already uses
the same data. `owner$` (the account profile) is not used.

### 4) Entry point

Add a "Place info" row as the **third** entry on the settings hub's
(`apps/web/src/app/features/place/pages/PlaceSettingsHubPage.tsx`) first card (Figma 3408-26299 order: My
profile → Place profile → Place info). Being read-only, it is **shown to everyone, with no owner gate**. The
card title changes from "Profile" to "Settings" to follow Figma.

### 5) Scope

**In**: items 1–4 above, the new ghost-avatar asset (`libs/web-ui-kit/src/resources/assets`), a new
info-row component (label + value) in web-ui-kit if needed, and ko/en translation keys.

**Out**: leaving a place · deleting a place · managing reports (deferred by explicit direction from the
user). The bottom action area and its divider are not rendered at all this round — not left as empty space,
simply not present. ~~Intro text (`desc`) is left out, since it's not in Figma.~~ →
**Reversed by [ADR-0074](./0074-place-introduction-text.md)** (2026-09-07): the reason for exclusion was
"not in the design", and that condition no longer holds. The intro text is now shown on the info, edit, and
hub screens, and is drawn for the relay default place too — a point where it diverges from the decision
above to drop the creation-date and owner rows there.

**~~Open (confirm by measurement at implementation time)~~ → resolved (2026-08-07).** Measured result:
`createdAt` comes back for both relay and cloud. `ownerId` · `owner$` · `isOwner` exist **only on cloud**;
the relay default place has none of them (it is a `stereo: 'domain'` system site). `owner$.name` is not a
human name but an internal identifier (`"LMN:…"`), which retroactively justifies decision 3. The missing-data
policy is confirmed as **hide the row**, so the relay screen renders no owner-info section as a result. This
divergence from the Figma relay screens (3769-34116/34207, which do draw an owner-info section) is resolved
by the planning confirmation in decision 2 above — it isn't hidden because the data is missing, it's hidden
because that was decided. Field tables and details live in
`apps/web/docs/feature/place/place-settings.md` §Measured data.

## Alternatives

- **Leave `PlaceInfoPage` as-is and add the new screen under a different name** — fewest files touched, but
  perpetuates the mismatch where `Info` means "edit". Rejected, since the renaming cost (a few routes, the
  hub, some tests) is small.
- **Show `place.owner$` directly** — saves one lookup, but yields a blank screen if the server doesn't
  populate it, and it's an account profile that may differ from the place nickname. Rejected.
- **Drop the label branch and always say "Place name"** — simpler, but diverges from the Figma non-owner
  screen. `isOwner` is already loaded, so the branching cost is near zero. Rejected.
- **Pre-render the bottom actions (leave/delete/report management) in a disabled state** — exposes UI that
  doesn't work and misleads the user. Rejected.

## Consequences

- **What is gained**: code terminology now matches Figma and the spec (`edit` = editing, `detail` = info).
  The relay/cloud branch collapses onto the existing `HOME_PLACE_ID` lever, adding no new branching concept.
  Most of the new code is existing web-ui-kit parts assembled together, so one new asset plus one new screen
  is the real addition.
- **What is accepted**:
    - The rename touches route constants, the settings hub, `paths.test.ts`, and the existing page's tests
      together (mechanical, but must land as one commit).
    - Owner display now carries one profile lookup, so on a cache miss the owner row fills in after the
      name.
    - The screen looks incomplete next to Figma with the three bottom actions missing. A follow-up track
      fills them in.
    - The `createdAt`/`ownerId` missing-data policy was open, so further decisions may be appended to this
      ADR based on measurement.
