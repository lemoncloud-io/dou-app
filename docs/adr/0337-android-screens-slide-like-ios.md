# ADR-0337: Android screens slide, the same as iOS

> Status: Accepted · Decided: 2026-11-17 · Implemented: `feat/android-slide-transition`
> · Scope: `apps/web/src/pageTransitions.css`
> · Supersedes: [ADR-0336](./0336-android-screens-move-on-a-horizontal-shared-axis-and-system-back-animates.md)
> decision 1 (decisions 2 and 3 stand)
> · The module doc is [apps/web page transitions](../../apps/web/docs/shell/page-transitions.md)

## Context

ADR-0336 replaced the package's vertical "lift" on Android with Material's shared axis X: the two
screens move 30px sideways while the old one fades out and the new one fades in after it. Seen on a
phone, that does not read as one screen giving way to another. A 30px offset is a small fraction of
the screen and the opacity change carries the whole transition, so it reads as a fade out and a fade
in — the same complaint the lift had, on a different axis. What is wanted is a screen that visibly
slides in, and one that visibly slides out.

## Decision

**On Android, a screen change is the package's slide — the one iOS already plays.** The new screen
slides in from the right edge over the old one, which drifts 30% left and dims to 93%; back runs it
the other way, over 350ms on the package's slide curve. Neither screen fades. It stays an override of
the package's `.android` rules in apps/web, now pointing them at the slide's keyframes and
`--pt-slide-*` variables instead of keyframes of the app's own.

## Consequences

- **The two platforms move the same way.** There is one motion to tune, and a change to the package's
  slide reaches Android too.
- **The Android look is the iOS gesture vocabulary** — a full-width push with a dimmed parallax. That
  was the reason ADR-0336 turned it down; the shared axis reading as a fade in the app outweighs it.
- **Back is quicker and the double-press window shorter.** The transition is 350ms instead of 450ms,
  so fewer quick second presses land inside a running one; ADR-0336's handling of those is unchanged.
- **Unchanged from ADR-0336:** the override still wins by import order, reduced motion still turns
  it off through the package's `!important` rule, and the system back still plays the same back
  transition as the header's arrow.

## Alternatives considered

- **A pure Android push** — both screens moving the full width, no dimming, as Android's older
  `slide_in_right`/`slide_out_left` activity animations did. It is a slide too, but it needs keyframes
  of the app's own for a difference few would notice next to the package's slide.
- **Keep the shared axis and widen the offset.** Past a certain distance it is a slide with a fade on
  top, and the fade-through's blank middle frame becomes more visible, not less.
