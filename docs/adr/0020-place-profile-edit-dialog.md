# 0020. Turn the place profile "edit" screen into a dialog and rebuild it on ui-kit

> Status: Accepted · Decided: 2026-07-20

## In one line

Make the screen that edits my profile (name and photo) in a place match the
[creation screen (0012)](0012-place-profile-creation.md), which is already on the new design: the same
**dialog overlay plus ui-kit**. `SiteProfileEditPage`, a routed page today, becomes
`PlaceProfileEditDialog`, and the body the two share is extracted.

---

## Context

The target Figma: [DoU / "Edit my profile" (node 3186-24908)](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3186-24908&m=dev).
The screen is a centred title and subtitle (`This is the profile you use in <place>.`), an avatar with
a plus badge, a name field (label\*, counter, description) and a Done CTA — the same layout as the
creation screen.

Three screens have to be kept apart (carrying on 0012's terms):

| Subject                        | What it does                                        | Owner (existing)                              |
| ------------------------------ | --------------------------------------------------- | --------------------------------------------- |
| Place profile — create         | **First** creation of my profile in that place      | `PlaceProfileCreateDialog` (new design, done)  |
| Place profile — **edit**       | **Changes** a profile I already have                | `SiteProfileEditPage` (old) ← **this round**   |
| Place (entity) info            | The space's own name and creation date              | `PlaceInfoPage` (out of scope)                 |

Where the code stands:

- **Edit**, `SiteProfileEditPage` (`apps/web/src/app/features/mypage/pages/SiteProfileEditPage.tsx`)
    - A routed page (`/mypage/site-profile`), reached by `navigate` from the home header dropdown
      (`apps/web/src/app/features/home/pages/HomePage.tsx:186`).
    - Old raw HTML: `<input>` / `<button>` / `<label>` directly, `lucide-react` (`Camera`, `User`)
      imported directly (against the icon barrel convention), and a hardcoded `bg-[#B0EA10]`.
- **Create**, `PlaceProfileCreateDialog`
  (`apps/web/src/app/features/home/components/PlaceProfileCreateDialog.tsx`)
    - A dialog overlay already migrated to this Figma design. It uses `ProfileAvatar`, `TextField`,
      `Text`, `FloatingButton`, `ModalTopBar`, `Toast` and `AlertDialog` (`@chatic/web-ui-kit`).

The two are **effectively twins**: the same save path
(`profileRepository.setMyProfile({ nick, thumbnail })`), differing only in title, initial values and
the save copy.

Constraints:

- Components come from `@libs/web-ui-kit`. Anything missing is defined in the library first.
- Where Figma has a specific icon, pull the resource.

## Decision

1. **The target is the profile edit screen.** `PlaceInfoPage` (editing the place entity) does not
   correspond to this Figma and is out of scope.

2. **Rename `SiteProfileEditPage` → `PlaceProfileEditDialog`.** Unify the "Site" naming as "Place" and
   match the creation twin's suffix (Dialog).

3. **Turn the routed page into a dialog overlay.**
    - Mount it on HomePage with `open` / `onClose`, like `PlaceProfileCreateDialog`.
    - Remove the `site-profile` route under `mypage` and the `ROUTES.mypage.account.siteProfile`
      constant.
    - Change the profile item in the home header dropdown from `navigate(siteProfile)` to toggling the
      dialog `open`. It opens this dialog **regardless of cloud kind** (the default cloud included,
      since relay supplies a `selectedSiteId`, so the existing `account.edit` branch goes). With no
      active place (`selectedSiteId`), the menu item is disabled.

4. **Extract the shared body of create and edit.** Build one body holding the avatar, the name field,
   the description, the CTA and the unsaved-changes guard (AlertDialog), and make create and edit thin
   wrappers. They differ only in title and subtitle, initial values (edit prefills from
   `useMyProfile`), the CTA copy and success handling.

5. **In principle, nothing new in ui-kit.** Every design element exists: `ProfileAvatar` (86px with
   the plus), `TextField` (label\*, counter, description), `ModalTopBar` (X), `FloatingButton` (Done),
   and the icons `IconPlus` / `IconUser` / `IconClose`. If something turns out to be missing during
   implementation, define it in web-ui-kit then.

Scope:

- In: points 1–5, the related i18n keys, and cleaning up the old `SiteProfileEditPage`, its route and
  its tests.
- Out: improving `PlaceInfoPage`, and changing `CloudProfileEditPage` / `ProfileEditPage` themselves
  (the home dropdown no longer goes to `account.edit`, but the route and page stay).

## Alternatives

- **Keep the page, restyle only** — keeps the routing and applies the ui-kit design. A smaller change,
  but the entry shape then differs from create (a dialog) and the "Dialog" naming does not match.
  → Rejected.
- **Build the edit dialog independently** — copy the creation design. Low coupling, but two twin
  copies to maintain. → Rejected in favour of extracting the shared body.
- **Target `PlaceInfoPage`** — it almost matched the user's original phrase ("the place profile
  settings screen"), but the Figma node is the profile (nick and photo) screen, so it does not.
  → Excluded.

## Consequences

- What is gained: create and edit are consistent in UX and in code, the ui-kit conventions (icon
  barrel, tokens) are followed, the twin duplication goes, and the "Site → Place" naming is settled.
- Trade-offs:
    - Entry moves from a route to an overlay, so the deeplink (`/mypage/site-profile`) disappears.
      Check that nothing enters it directly (today there is one reference, the HomePage dropdown).
    - Extracting the shared body also refactors the creation dialog, so
      `PlaceProfileCreateDialog.test.tsx` needs a regression check.
- Separately (out of scope): `PlaceInfoPage`'s owner guard is implemented as
  `if (place.isOwner) navigate(-1)`, the opposite of its comment ("go back if not the owner"), which
  looks inverted. Handled as separate work.

## Next steps

This ADR feeds the spec phase (Phase A) of dev-2_implement.
