# ADR-0233: `apps/web` is a 600px phone column on every wider display

> Status: Accepted · Decided: 2026-10-26
> Scope: `apps/web/src/styles.css` · `apps/web/tailwind.config.js` ·
> `apps/web/docs/shell/layout-shell.md` · `DESIGN.md`
> Supersedes: §1 of [ADR-0104](./0104-web-adaptive-single-column-and-overlay-width-rules.md) (the
> phone-class bound). Its §2–§6 — bounded content inside the column, no viewport units, the three
> overlay rules, CSS rather than JavaScript for layout — stand unchanged.

## Context

ADR-0104 made `--app-width` the upper bound of the phone class: every surface filled the device up
to 860px and only capped past it, so an unfolded foldable showed the app edge to edge. It rejected
a lower cap around 600px by name, because that leaves empty margins on an unfolded device.

iPhone Duo's inner display is 951 pt wide in landscape; inside the shell's side inset the WebView
is 867 wide. Raising the bound to 960 filled it, and what that produced was the phone layout
stretched across a near-tablet display: a list row ran 831px wide, and the login buttons and
signup inputs about 820px. Apple's Duo guidance names exactly this — a stretched iPhone app on the inner
display — as the thing not to ship. The alternatives that use the width properly (a list beside a
room, a sidebar) are routing work this app has not taken on.

The product direction is the other answer to the same guidance: keep the phone app a phone app, in
a phone-width column in the middle, and let the sides be visibly empty.

## Decision

1. **`--app-width` is 600px, a phone's column rather than the widest device.** Every phone is
   narrower, so on a phone nothing changes. Anything wider — an unfolded foldable, iPhone Duo's
   inner display, a tablet, a desktop browser following an invite link — gets the same 600px column,
   centred. Nothing about how the value is read changes; the readers ADR-0104 lists all follow it.
2. **The sides are a margin, and it is visible.** Past 600px `body` paints `bg-secondary` and the
   column paints `bg-background`, so the column reads as the app and the sides as empty space. Up to
   600px `body` stays `bg-background`, so a phone's overscroll is unchanged.
3. **600 rather than a smaller phone width.** It clears the largest phones (430) with room to spare
   without letting a list or a chat line run long, and it sits just above the 560px a form of a few
   fields reads well at — so a form screen needs no column of its own, and there is no second width
   for a new screen to opt into.
4. **Nothing moves off the fold.** Half-open like a book, iPhone Duo folds down the middle of the
   column. The column, its tab bar and a notice dialog stay centred across the fold: moving them to
   the trailing side, as Apple's guidance suggests for a full-width layout, pushes them past the
   column's edge into the margin.

## Alternatives considered

**Fill the display (ADR-0104 §1 at 960px).** Built on the way to this decision and replaced: every
screen became the stretched layout the Duo guidance warns against.

**Fill, with a narrower column for form screens only.** Also built: lists filled the display and
forms kept a 560px column. It left two widths and an opt-in rule every new form had to know, and the
lists were still the stretched layout.

**Move dialogs and the tab bar to the trailing side of the fold.** Built against the filled layout,
where it worked. Inside a 600px column the trailing half is a strip of about 240px ending at the
column's edge; a 311px dialog centred in the display's trailing half puts a third of itself in the
margin, and the tab bar overhangs it the same way.

**480px.** Closer to a phone, and still a reasonable choice. 600 was picked so the column has
visibly more room than a phone on a display this wide, and so forms did not need their own width.

## Consequences

- **An unfolded foldable shows margins again.** ADR-0104 removed them on purpose; they are back by
  decision, with a colour that says they are margins rather than a layout that failed to fill.
- **Tablets and desktop browsers get the 600px column too**, narrower than the 860 they had. That
  includes the public invite and share pages reached from a desktop browser.
- **The number is in two places.** The `body` margin rule's media query cannot read a CSS variable,
  so it repeats 600 (`min-width: 601px`) beside `--app-width`. The variable's comment says to change
  both together.
- **On a half-open iPhone Duo the fold runs through the column.** Content, the tab bar and dialogs
  sit across it. The cost is accepted for one column that looks the same in every posture.
