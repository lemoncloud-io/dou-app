# ADR-0034: Simplify the relay home, section the cloud switch sheet, add a cloud guide screen

> Status: Accepted · Decided: 2026-08-03

## Context

Figma revised the designs for the relay (DoU Home) home, the cloud switch sheet, and a new "My cloud
guide" screen.

| Screen                                     | Figma node                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Relay home (revised)                       | [3486-26403](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3486-26403) |
| Cloud home (reference baseline, unchanged) | [2931-8181](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=2931-8181)   |
| Switch sheet — zero owned clouds           | [3477-23611](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3477-23611) |
| Switch sheet — with a list                 | [3486-25407](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3486-25407) |
| Switch sheet — every section collapsed     | [3486-25889](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3486-25889) |
| My cloud guide (new)                       | [3519-29515](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3519-29515) |

What the implementation looks like today:

- The relay and cloud homes are rendered by one file, [HomePage.tsx](../../apps/web/src/app/features/home/pages/HomePage.tsx),
  branching on `isDefaultCloud`, and relay also shows the single default place through `PlaceList`
  (ADR-0014 item 4, `apps/web/docs/feature/home/README.md`).
- The switch sheet [CloudSessionSheet.tsx](../../apps/web/src/app/features/home/components/CloudSessionSheet.tsx)
  uses a `TabBar` to switch between two tabs, "My clouds" and "Invited clouds", and shows
  "＋ Add cloud" in the sheet's fixed footer only when the user owns zero clouds.
- There is no screen that explains the cloud subscription. The only prompts are a toast and inline
  text.
- The two-line row layout (owned = `cloud.email`, invited = "{owner}'s cloud"), the status badges, and
  the 30-second provisioning poll are already implemented.

Constraints:

- Components are built on `@chatic/web-ui-kit`. A missing component is defined in that library first
  and then used.
- Payment goes through IAP, so the existing `SubscriptionSelectDialog → EmailVerifyDialog → IAP` path
  is not touched.
- i18n is filled in for both the `ko` and `en` locales.

## Decision

### 1. Remove the Place section from the relay home (relay mode only)

- When `isDefaultCloud === true`, `PlaceList` is not rendered. The layout is header → promo banner →
  `Chat` section, and nothing else.
- In cloud mode (`isDefaultCloud === false`) the Place section stays exactly as it is, including
  "Add place" (Figma 2931-8181).
- A relay place is **always exactly one and connects automatically**. The "select the first place when
  no place is active" behaviour of `useHomePlaces` + `useSwitchPlace` stays as it is; the session
  connection is kept and only the UI is removed.
- The `/place/:id` route and the place-settings path in the header profile dropdown both stay. Only
  the entry point through the home list disappears.

### 2. A new promo banner (shared by home and sheet)

- Add `PromoBanner` to `@chatic/web-ui-kit`: a leading icon slot, two lines of body text, an optional
  action link, and an optional close button.
    - Relay home: uses both the link ("Add cloud >") and close.
    - Switch sheet: close only, no link — "＋ Add cloud" exists as a separate button.
- **When it shows**: only when the user owns zero clouds. With one or more, it shows in neither place.
- **Dismiss persistence**: home and sheet **share a single dismiss key**. The dismiss timestamp is
  stored in `usePreferenceStore` with a **24-hour TTL**, so it comes back a day later. Dismissing it
  in the sheet leaves the "My clouds" section with just the "＋ Add cloud" button.
- The banner's "Add cloud >" link **keeps the existing flow** (`SubscriptionSelectDialog →
EmailVerifyDialog → IAP`). It does not route through the guide screen. <br>**→ Revised 2026-08-04:
  reversed by [Revision history](#revision-history) note 1 below. The banner goes to the guide
  screen.**

### 3. Rework the cloud switch sheet from tabs into three collapsible sections

- Drop the `TabBar` and use three `CollapsibleSection`s: "Home" / "My clouds N" / "Invited clouds N".
  The invite-count badge is absorbed into the section count.
- Extend `CollapsibleSection` — both slots **must be visible even when collapsed** (evidence: Figma
  3486-25889):
    - `description`: a sub-caption under the header ("Start a group conversation in your own space").
    - `footer`: a fixed area outside the collapsible body ("＋ Add cloud").
- "＋ Add cloud" **moves from the sheet's fixed footer into the "My clouds" section footer** and is
  **always visible**, regardless of how many clouds are owned. The old "only when zero" rule is
  dropped.
- "My clouds" section: shows `PromoBanner` when the count is zero, and the `description` when it is
  one or more.
- Kept: the two-line rows, the status badges (reserved/suspended/expired/error), the provisioning
  spinner and its 30-second poll, the "Your cloud is ready" toast, pinning the selected item to the
  top (`sortCloudsForSwitcher`), and the sheet's fixed 90vh height (including the all-collapsed
  state).
- **The name-edit pencil is removed from the sheet.** `CloudNameEditDialog` has no remaining consumer,
  so it is deleted, and renaming a cloud is consolidated onto the single `/mypage/cloud-profile` path.
- The selection mark on the "Home" row becomes the lime circular check, like the others.

### 4. A new cloud guide screen — `/subscription/guide`

- Add the route `ROUTES.subscription.guide = '/subscription/guide'`, with **the ListRow of the
  "Subscription" MenuCard on My Page as the entry point**. <br>**→ Revised 2026-08-04: the home banner
  became an entry point too. See [Revision history](#revision-history) note 1.**
- Layout: `ModalTopBar` (back) → hero (three-line title + 102px cloud illustration) → `DoU Home` card
  (FREE badge + three limits) → three-dot ornament → "My cloud" card (PRO badge + three benefits + app
  screenshot) → fixed CTA at the bottom.
- The three dots are a **static ornament** that grows in size, not a carousel indicator. The whole
  screen is a single vertical scroll.
- The bottom CTA "Start your 7-day free trial" navigates to `/subscription/plans`. **The "7 days" is
  rendered from `product.trialDays`**, and when there is no value it falls back to copy that does not
  mention a trial.

### 5. New and extended web-ui-kit pieces, and assets

| Item                 | Action                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PromoBanner`        | New (composites/feedback)                                                                                     |
| Plan comparison card | New (composites/subscription) — badge + title + item list + optional media. Reuses the existing `BenefitItem` |
| `CollapsibleSection` | Add the `description` and `footer` props                                                                      |
| Lime circular check  | Extracted as an icon resource (currently uses `lucide-react` directly)                                        |
| Cloud illustration   | New asset — 102px (guide screen) / small (banner)                                                             |
| Guide app screenshot | New image asset (196×229)                                                                                     |

### Out of scope

- `CloudRail` / `useCloudSwitchFlow` in `apps/desktop-web` are out of scope this time.
- No changes to payment/IAP logic, or inside `SubscriptionSelectDialog` and `EmailVerifyDialog`.
- No changes to the session switch pipeline (`switchCloudSession`, `logoutCloudSession`).

## Alternatives

- **Keep the Place section on the relay home and only add the banner** — it does not match Figma, and
  since a relay place is always one and connects automatically, the list adds no information.
  Rejected.
- **Hide the section conditionally based on whether the place has content** — a relay place is fixed
  at one, so there is nothing to branch on. All that remains is the cost of a layout that shifts with
  state. Rejected.
- **Keep the sheet's tab structure** — the three groups (relay / owned / invited) cannot be scanned at
  once on one screen, and the invite count has to be expressed separately as a badge. Rejected.
- **Insert the guide screen in front of the add-cloud flow** — adding a step to a proven IAP purchase
  conversion path is a large risk. Only the separate entry point is adopted. Rejected.
- **Rework the existing `/subscription` into the guide** — that screen manages subscription state, a
  different purpose from a guide for new users. Rejected.
- **Persist the banner dismiss forever / limit it to the session** — forever loses the chance to bring
  people back, and session-only shows up too often. The 24-hour TTL is adopted. Rejected.
- **Keep the name-edit pencil in the sheet** — it is in none of the three Figma frames, and My Page
  already has a rename path. Rejected.
- **Hardcode the "7 days" copy** — if it diverges from the product configuration it becomes a false
  claim. Binding to `trialDays` is adopted. Rejected.
- **Apply this to desktop-web at the same time** — its left rail structure means the sectioned design
  cannot be ported as is, and it needs its own design. Split into a later track. Rejected.

## Consequences

What is gained:

- The relay home simplifies down to one `Chat` section, and the space that frees up is used by the
  subscription promo banner.
- The switch sheet shows relay, owned, and invited clouds on one screen at once, and because
  "＋ Add cloud" is always visible, users who already own a cloud have a path to subscribing to
  another.
- New users get a screen that explains what a cloud is worth.
- `PromoBanner`, the plan comparison card, and the `CollapsibleSection` extension remain as shared
  web-ui-kit assets.

Trade-offs accepted:

- **Documentation has to be updated**: the relay description in ADR-0014 item 4 and the relay spec in
  `apps/web/docs/feature/home/README.md` (showing the default place) are superseded by this ADR.
- **The home entry point to `/place/:id` disappears in relay** — only the header profile dropdown and
  deep links remain. Reaching relay place settings requires knowing about the dropdown.
- **Renaming in the sheet regresses** — with `CloudNameEditDialog` deleted, renaming means going to My
  Page.
- **Web and desktop speak different switch-UI languages** — until desktop-web follows, the cloud
  switch UX differs between the two platforms.
- **The "7 days" copy depends on the IAP product configuration** — changing `trialDays` changes the
  copy with it, and an empty value shows the fallback copy.
- **The banner's 24-hour TTL runs off the device's local clock** — it can be worked around by changing
  the clock, which is acceptable for a promo banner.
- **The bundle grows** — the guide screen's app screenshot is a new image asset.

## Revision history

The body of an ADR is the record as of the decision, so it is not deleted. Only what was later
reversed is appended here.

### 1. Home banner → routes through the guide screen (2026-08-04)

**Reversed decision**: from decisions 2 and 4, "the home banner goes straight to
`SubscriptionSelectDialog` without routing through the guide screen".

**After the change**: "Add cloud >" on the relay home banner navigates to `/subscription/guide`.
"＋ Add cloud" in the switch sheet footer **still goes straight to the plan picker**.

**Why**: going direct was originally chosen to avoid "the risk of adding a step to a proven purchase
conversion path". But the user context differs between the two entry points — someone looking at the
banner does not yet know what a cloud is, while someone tapping the sheet footer has already come into
the cloud management screen and knows what they are buying. The first needs an explanation first; for
the second, inserting an explanation really is an unnecessary step.

**What is accepted**: two entry points with the same copy ("Add cloud") now have different
destinations. The context difference is the reasoning, but a user who alternates between the two paths
may find it inconsistent.

### 2. The guide-screen consolidation attempt was withdrawn — decision 4 restored (2026-08-19)

**Reversed decision**: none. This is a record of **an implementation that undid decision 4 (adding
`/subscription/guide`) without revising the ADR, and was then withdrawn**.

**What happened**: commit `13be9b49` deleted `CloudGuidePage` and the `/subscription/guide` route and
merged the guide content into the plan picker (`SubscriptionPlansPage`). The reasoning was "the guide
sits on a screen that the home entry point skips, so half the users never see it" — a problem revision
1 above had already solved (the home banner has routed through the guide screen since 2026-08-04). A
follow-up commit `86b109be` moved the `cloudGuide.pro.*` strings to `benefits.*`, and `96baca75`
deleted the document and the preview images.

**After the change**: restore decision 4. `guide` and `plans` are separate screens again, and Figma
also still has both frames (3519-29515 "My cloud guide" / 2870-33021 "Subscription guide screen").
The entry points are as revision 1 left them. The strings that moved to `benefits.*` during the
consolidation stay with the plan picker, and the guide screen holds its own `cloudGuide.*`.

**Why**: `PlanCompareCard` and `PlanBulletList` in `web-ui-kit` were built for this screen only, so
after the deletion they remained as orphans with zero app consumers, and the "Read-only pitch …
(ADR-0034)" comment in `MyPage` plus the `openCloudGuide()` function name in `HomePage` kept pointing
at a screen that no longer existed. The implementation was out of step with the ADR.

**What is accepted**: the three subscription benefits are stated on two screens. The judgement that
the two screens are separate came first, and the namespaces were kept apart so each screen's copy can
be refined independently.
