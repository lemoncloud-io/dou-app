# Home screen: apply the revised Figma design — floating nav, the relay cloud, counts, avatar alignment

## Status

accepted

Decided: 2026-07-16

Related ADRs: [[0011-web-layout-shell-and-floating-bottom-nav]](./0011-web-layout-shell-and-floating-bottom-nav.md)
(the floating nav it extends), [[0013-home-screen-web-ui-kit-migration]](./0013-home-screen-web-ui-kit-migration.md)
(the base this revision builds on)

## Context

ADR-0013 migrated the home screen (`apps/web/src/app/features/home`) to `@chatic/web-ui-kit`, so the
header, the Place and Chat sections, the rows and the cloud sheet are design-system components. Figma
then produced a **revised design** for home (nodes `2931-8611`, `2933-9999`, `2933-9794`), and this
round applies it.

Several of the reported issues are **already implemented**. Investigation found the request and the
current branch out of step:

| #   | Request                                          | State in the code                                                                                                                         | Evidence                    |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | The bottom nav covers the chat list              | `FloatingTabBar` already floats with `pointer-events-none`. But a 96px `from-background` **gradient backdrop** at the bottom visually covers the content behind it | `FloatingTabBar.tsx:58-61`  |
| 2   | Place selection mark plus an unread red dot      | **Implemented** (`VerifiedBadge` plus the red dot)                                                                                         | `PlaceItem.tsx:41-48`       |
| 3   | Circular photo crop                              | **A bug** — channel thumbnails render as squares at their original size. `PlaceItem` is fine; only `ChannelList` is broken                  | `ChannelList.tsx:65-68`     |
| 4   | A "DoU Home" label plus mark for the relay cloud | **Missing** — relay (default) is not listed among the clouds                                                                               | `CloudItem.tsx`             |
| 5   | Cloud selection check plus a layout change       | The check icon is **implemented**; the layout needs the revision                                                                            | `CloudItem.tsx:81`          |
| 6   | Channel unread badge                             | **Implemented** (`UnreadBadge variant="pill"`)                                                                                             | `ChannelList.tsx:100`       |
| 7   | Counts beside the Place and Chat titles          | Not wired — though `CollapsibleSection` **already has** a `count?` prop                                                                     | `CollapsibleSection.tsx:11` |

So the work is **mostly applying the revised Figma design**, and item 3 is a separate, real rendering
bug (confirmed by the user's screenshot). The rest is not "build what is missing" but "align what
exists with the revised design".

**Root cause of item 3** — `ListRow` wraps `leading` in a `flex` wrapper (`ListRow.tsx:52`).
`PlaceItem`'s thumbnail `<span size-[46px]>` is a direct child of that flex, so it is blockified and
its size applies. `ChannelList` adds another wrapper, `<div className="relative">`
(`ChannelList.tsx:65`), for the member-count overlay badge, which leaves the thumbnail `<span>` an
`display:inline` element inside a block div. An inline element ignores `width` and `height`, so
`size-[46px]` never applies, `<img size-full>` grows to its original size, and the result is a square
(`rounded-full` only rounds the corners of a huge square). The screenshot — a member badge at the top
left of a big square — shows exactly this.

Figma MCP authentication came through, so the three revised nodes were read directly. The settled
visual spec:

- **`2931-8611` (home)** — a grey count beside the section title (`Place 1`, `Chat 4`). A selected
  place gets a blue check; an unselected place with unread gets a red dot (matching today). The
  **channel member count moves inline, as a grey pill after the name** (today it overlays the top left
  of the avatar, so this changes). Unread stays a pink trailing pill (matches).
- **`2933-9794` (cloud switch)** — a **"DoU Home"** row at the top of the `My clouds` list, with the
  green DoU mark. The selection mark moves **from a purple check on the left to a green check (✓) on
  the right (trailing)**. A row is [avatar][name / subtitle] … [trailing check].
- **`2933-9999` (the DoU mark)** — a green circle (`#90c304`, `--main2_color`) with the lemon
  character. The lemon glyph matches `dou-logo.svg` (28×28), which the kit already has, so reuse it and
  add the green circle in CSS. No new export.

Label language, settled: Figma renders "DoU Home" even in the Korean UI, but the label branches on
i18n — **Korean "두유 홈" / English "DoU Home"** (the user decided this). It deliberately differs from
the Figma render.

## Decision

Refine the home screen against the revised Figma, **web-ui-kit first**. It inherits ADR-0013's
principle: replace presentation only, and preserve data flow, unread, last-chat and the sync
registration model. No colour hex or icon goes into home directly; a missing primitive is defined in
`@chatic/web-ui-kit` and imported from there.

**In scope**

- **(1) Floating nav — remove the backdrop.** Remove `FloatingTabBar`'s 96px `from-background`
  gradient backdrop **first**, and check that the content behind it is fully visible. The goal is that
  only the pill floats and the area behind it is untouched. (This is a kit change and therefore a
  descendant of ADR-0011, so it affects every screen that uses the nav — home, my page and the rest.
  Re-check readability after removing it.)
- **(4) The relay cloud — new.** Show the relay (default) connection at the **top** of the `My clouds`
  list in the cloud switch sheet, labelled **"두유 홈" (Korean) / "DoU Home" (English)** with the green
  DoU mark (Figma `2933-9794` / `2933-9999`). When active, it gets the trailing green check. The mark
  reuses the kit's `dou-logo.svg` plus a green circle in CSS — no new asset.
- **(5) Revise the cloud selection layout.** Move `CloudItem`'s selection check **from the purple
  (`#C139E3`) one on the left to a green trailing check on the right**, and restructure the row as
  [avatar][name / subtitle] … [trailing check] (Figma `2933-9794`).
- **(2)(6) Align the place and channel marks and badges.** The blue place check and the unread red dot
  stay as they are (they match Figma). The **channel member count moves from the avatar overlay to a
  grey inline pill after the name**. The pink trailing unread pill stays (Figma `2931-8611`).
- **(3) Fix the circular avatar crop.** Extract the repeated "thumbnail img → circular crop" pattern
  into a **reusable image avatar primitive** in `@chatic/web-ui-kit` — give the existing `avatarBase`
  a `src`, or let `PlaceAvatar` / `ChatAvatar` take an image source. Forcing a block-level box makes
  the inline-span bug impossible, and both Place and Channel use it. The remaining uncropped spots
  (header, sheet) move to the same primitive.
- **(7) Wire the section counts.** Pass `places.length` / `channels.length` into
  `CollapsibleSection`'s existing `count` prop from `PlaceList` / `ChannelList`, so the counts appear
  beside the Place and Chat titles. No new component.

**Out of scope**

- Changes to data flow, unread, last-chat or sync registration logic (inherited from ADR-0013).
- Making the unbuilt features actually work — search, creating a 1:1 chat. Separate work.

## Alternatives

- **Treat it as a runtime bug hunt** — debug why 2, 3, 5 and 6 are not visible. Rejected: the user
  settled the nature of the work as "apply the revised design". The code already has them, so it is a
  design-update problem, not a bug.
- **Build new kit components for the counts and the floating nav** — unnecessary.
  `CollapsibleSection.count` and `FloatingTabBar` already exist, so building again would duplicate
  them.
- **Inline hex and icons in home** — rejected; it breaks the web-ui-kit-first principle (ADR-0013).
- **Implement immediately from common sense, without Figma** — risks missing the revised design's
  exact spec. The user chose to authenticate and resume.

## Consequences

- **Removing the nav backdrop is global.** Per ADR-0011 the shell owns `FloatingTabBar`, so the change
  reaches every tab screen that uses the nav, not just home. After the gradient goes, each screen has
  to be re-checked for readability as content scrolls behind the pill.
- **The size of the change differs per item.** 7 is wiring; 2 stays as it is; 6 inlines the channel
  member count; 3 extracts a kit image-avatar primitive (a bug fix); 1, 4 and 5 are new work (removing
  the backdrop, the relay label, moving the check).
- **Item 3 is fixed in the kit.** Rather than patching span display in home, it becomes a reusable
  primitive, so the same inline-span bug cannot come back in another consumer (web-ui-kit first).
- **The DoU mark reuses an existing asset.** The kit's `dou-logo.svg` (28×28) matches the Figma glyph,
  so there is no new export. Where a primitive is missing — an image avatar, say — it is added to the
  library so the revised Figma is expressed more completely.
- **The "두유 홈" / "DoU Home" i18n split is settled.** Korean "두유 홈", English "DoU Home". It
  deliberately differs from the Figma render ("DoU Home"), so it goes through i18n resources and is
  never hardcoded.

## Next steps

Continue into the spec phase (Phase A) of [[dev-2_implement]]. Every item is ready to start; nothing
is unresolved.
