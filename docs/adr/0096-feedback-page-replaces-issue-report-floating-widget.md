# ADR-0047: Remove the issue-report floating widget and switch to a "Send feedback" page under My Page

> Status: Accepted · Decided: 2026-08-07
> Related: [ADR-0017](./0017-issue-report-floating-widget.md) (superseded by this decision) ·
> [ADR-0013](./0013-home-screen-web-ui-kit-migration.md) (web-ui-kit first) ·
> [ADR-0046](./0046-web-feature-ownership-and-barrel-hygiene.md) (feature ownership · barrel hygiene)

## Context

[ADR-0017](./0017-issue-report-floating-widget.md) shipped a **draggable floating issue-report widget** (FAB +
overlay form) that is still live in production. Design has now redefined this feature as a
**standalone "Send feedback" screen reached from My Page**.

### What the new design requires

| Figma node                                                                                     | Content                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [3293-39607](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3293-39607&m=dev) | My Page — the **"Report an issue" toggle row disappears**, and a `Send feedback` nav row appears at the top of the terms/version card                                                      |
| [3739-26078](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3739-26078&m=dev) | `Send feedback` full-screen page — back-navigation top bar, three lines of headline copy + 2 guidance bullets, a single textarea, photo attachment, floating `Submit` button at the bottom |
| [3744-26323](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3744-26323&m=dev) | Textarea component spec — focus / scroll / filled states, h198 · radius24 · border `#3A3C40`                                                                                               |
| [3739-26274](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3739-26274&m=dev) | "You can attach up to 5 photos." error toast                                                                                                                                               |
| [3293-40098](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3293-40098&m=dev) | Bottom nav — active background `#222325` → `rgba(3,13,35,0.7)`, inactive tab opacity 54%, label tracking `-0.1px`                                                                          |

### Code research before starting

- Current widget: `apps/web/src/app/features/issue-report/` — `IssueReportHost` / `IssueReportFab` /
  `IssueReportOverlay` / `useDraggable` / `buildReportContext`. Mounted once from `AppRuntime`.
- On submit, `apps/web/src/app/features/issue-report/lib/buildReportContext.ts` automatically attaches the
  **last 50 logs plus a device/version/viewport/path snapshot**. This diagnostic value is the core of the
  feature and is independent of the UI replacement.
- Visibility toggle: the `issueReportHidden` preference + the switch row at
  `apps/web/src/app/features/mypage/pages/MyPage.tsx:196`.
- **`ui/components/ReportIssueDialog.tsx` is dead code.** After ADR-0017 decided "do not extend this", only
  the barrel export survived and it has zero real call sites.
- **`title` is a required field of `reportIssue(title, message, extras)`**
  (`libs/web-core/src/api/common.ts:168`). The admin-v2 `report-logs` list also uses `title` to render its
  rows. Yet the new design has no title input.
- **web-ui-kit has no Textarea.** The current overlay reaches across a layer boundary and pulls the shadcn
  Textarea directly from `@chatic/ui-kit`.
- **There is still no image upload API.** The condition under which ADR-0017 deferred screenshots to Phase
  2 still holds.
- The My Page policy card sits outside the `isGuest` branch, so it renders for signed-out users too.
  `reportIssue` carries `isAuthenticated: false` in its payload and works fine for them.

## Decision

### 1. Remove the floating widget entirely

Delete `IssueReportHost` · `IssueReportFab` · `IssueReportOverlay` · `useDraggable`, its `AppRuntime` mount,
the `issueReportHidden` preference, and the My Page switch row. The entry point is unified to **one place: the
My Page "Send feedback" row**.

`buildReportContext` (automatic log/device attachment) **stays and is reused by the new page** — that is the
real value this feature delivers.

The dead `ui/components/ReportIssueDialog.tsx`, its barrel export, and the `reportIssue.*` i18n keys are
cleaned up alongside it.

### 2. Add a dedicated `/mypage/feedback` page

Create a new `features/feedback/` feature and route it through `ROUTES.mypage.feedback`.
`features/issue-report/` is replaced outright, folder and all.

**Guests can access it too** — it sits alongside the policy card, and the API already supports unauthenticated
calls.

### 3. Add a title field even though the design has none

Figma only has a single body textarea, but leaving `reportIssue`'s required `title` to be auto-derived from
the body would make the admin list's readability a matter of luck. **A required single-line TextField
(reusing web-ui-kit's `TextField`) is placed above the body textarea.**

The submit button is enabled **only when both the title and the body have non-blank values**.

### 4. Input constraints

- No character-type restriction — Korean, Latin, digits, special characters, and emoji are all allowed. No
  filtering or normalization is added.
- The character counter is **not shown in the UI**. A `maxLength` safety net of **5000 characters** is
  applied regardless, so that pasting a huge block of text does not fail the whole submission — the same
  payload also carries 50 lines of logs and a device snapshot.

### 5. Submission completes with a toast and returns to My Page

On success, show a toast and return to the previous screen immediately. This follows the app's existing
convention (a toast) instead of the spec's "completion notice popup". On failure, show a `destructive` toast
and preserve the entered values.

### 6. Add `Textarea` as a new web-ui-kit foundation

`libs/web-ui-kit/src/foundations/input/Textarea.tsx` plus a Storybook story. It implements the focus /
scroll / filled states from Figma 3744-26323. This is where the app's layer violation of reaching directly
into `@chatic/ui-kit`'s shadcn Textarea gets resolved.

### 7. Fix the bottom nav design

Change [FloatingTabBar](../../libs/web-ui-kit/src/composites/navigation/FloatingTabBar.tsx)'s active
background from `#222325` to `rgba(3,13,35,0.7)`, give inactive tabs 54% opacity, and set label tracking to
`-0.1px`.

### Out of scope (deferred)

**Photo attachment, in its entirety.** The section, gallery access, the 5-photo limit, and the over-limit
toast are all out of scope this round, and none of it is exposed as disabled UI either. It gets wired up as
a separate piece of work once an image upload API exists — the Phase 2 condition from ADR-0017 is still
unmet.

## Alternatives

- **Keep the FAB on dev/stage only** — QA reporting convenience survives, but the entry point splits in two
  and all the drag/persistence code stays on the maintenance surface. Rejected, since the new page is at
  most two taps away from any screen, so the convenience loss is judged small.
- **Auto-generate the title from the first 30 characters of the body** — no extra input burden and an exact
  match for Figma, but the admin list ends up with titles truncated mid-sentence, and summary quality
  depends on how the reporter wrote the body. Rejected in favor of an explicit field, which costs
  operations less.
- **Ask the backend to make `title` optional** — most faithful to the design, but blocks this work on an API
  negotiation. Rejected.
- **Build photo attachment locally and only defer the network call** — wiring up transmission later would be
  cheap, but it exposes UI that visibly does nothing when tapped. Rejected.
- **Show completion as a popup (`AlertDialog`)** — faithful to the spec's wording, but adds one more
  confirmation tap and breaks with the app's other submission flows. Rejected.

## Consequences

**What is gained**

- The entry point consolidates to one place, and the FAB that used to float over production screens
  disappears, removing content occlusion and mistaps.
- `useDraggable`, position persistence, the `issueReportHidden` preference, and the dead
  `ReportIssueDialog` are all net-deleted.
- web-ui-kit gains a Textarea, removing the app's direct shadcn reference. It is reusable on other screens.
- Automatic log/device attachment is preserved, so the report's diagnostic value is unchanged.

**What is accepted**

- **Reporting instantly from wherever you are** goes away. Users must navigate to My Page, which blurs the
  screen context at the moment of reporting. `buildReportContext`'s `path` would end up recording the
  feedback page's own path instead of the reported screen's — implementation must **capture the path just
  before entry and pass it along**.
- Requiring a trip to My Page may reduce the number of reports filed.
- The title field is not in Figma — implementation and design diverge by one element. This needs to be
  reconciled at the next design update.
- The spec expects photo attachment, but this release ships without it. QA/planning need to be told about
  the deferral.
- The 5000-character cap is not shown in the UI, so a user who exceeds it will see typing simply stop
  without knowing why.
- Users who had `issueReportHidden` saved as `true` are left with an orphaned local preference value
  (harmless to behavior).

## Next steps

Move on to the [[dev-2_implement]] spec-writing stage. Things to settle in the spec: i18n keys for the
headline/bullets/labels (ko/en), pixel specs for the Textarea's three states, how the entry path is
preserved, and the list of files to delete.
