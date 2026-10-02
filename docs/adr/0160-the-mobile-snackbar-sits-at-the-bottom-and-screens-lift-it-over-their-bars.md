# ADR-0160: The mobile snackbar sits at the bottom, and screens lift it over their bars

> Status: Accepted · Decided: 2026-10-02
> · Scope: `libs/ui-kit/src/components/ui/toaster.tsx` · `libs/ui-kit/src/utils/index.ts` ·
> `apps/web/tailwind.config.js` · `apps/web/src/styles.css` ·
> `apps/web/src/app/ui/components/BottomNavigation.tsx` ·
> `libs/web-ui-kit/src/composites/overlay/MediaViewer.tsx` ·
> `libs/web-ui-kit/src/foundations/button/FloatingButton.tsx`
> · Amends: [ADR-0155](./0155-the-viewer-offers-save-and-share-when-the-handshake-lists-both.md)'s
> premise that a toast slides in at the top — its buttons stay at the bottom, now with the snackbar
> lifted above them
> · The module docs are [ui-kit](../../libs/ui-kit/README.md) and
> [apps/web layout shell](../../apps/web/docs/shell/layout-shell.md#snackbar-clearance---toast-lift)

## Context

The mobile web app's snackbar — the kit `Toaster`, mounted once in `AppRuntime` — dropped in from
the top under the status bar, wore a 3px coloured edge, and was swiped up to dismiss. In dark theme
it turned into a light card. The Figma snackbar is a plain dark bar with a lime check, and the ask
was to bring it to the bottom: slide in and out from below, swipe to dismiss, keep clear of the
safe area, and hold up in dark theme.

The bottom is busier than the top. Home and my page pin the floating tab bar there, the image viewer
pins its share and save bar there (ADR-0155 put the buttons at the bottom precisely because the toast
was at the top), some twenty form screens dock a `FloatingButton` call to action there — riding on
the keyboard while it is up — and the chat room has its composer. The toaster sits above the router, so it cannot
see any of them.

## Decision

1. **The snackbar is bottom-anchored and swiped down.** It rests 16px above the taller of the
   home-indicator inset (`--safe-bottom`) and the soft keyboard (`--keyboard-height`), slides up
   into place, slides back down on its timer, and a downward swipe past Radix's 50px threshold
   dismisses it. The exit keyframe starts from the swipe's release point, so a swiped toast keeps
   moving instead of snapping back first.
2. **A bar pinned to the bottom lifts the snackbar itself, through `useToastLift(px)`.** The tab bar
   asks for 80px (nothing while the keyboard hides it), the `FloatingButton` panel for its measured
   height, the viewer's action bar for 76px. The hook keeps one registry and writes the tallest
   active lift to `--toast-lift` on `<html>`; the toaster adds it to its offset and knows nothing
   about who asked. A registry rather than each bar writing the variable: bars come and go out of
   order — a dialog's CTA opens over the tab bar, then the tab bar steps aside for the keyboard —
   and a bar that put back the value it found would restore a lift for a bar already gone.
3. **In dark theme the snackbar stays dark: BK_800 `#3A3C40`.** The lime check is under 2:1 on the
   old light card; on BK_800 it keeps the light theme's contrast, and the light theme's navy is too
   close to the `#121212` background to read as raised.
4. **The kit's `cn` knows the hosts' animation names.** A toaster replaces the primitive's own
   enter/exit animations; unregistered, `tailwind-merge` kept both and the config's declaration
   order picked the one that ran.

## Consequences

- **The snackbar covers the chat room's composer** for its five seconds, or until swiped away.
  Nothing publishes a lift there: the composer's height changes as it grows, and a toast that
  reports what was just done in the room belongs in view of it.
- **A bar that does not call the hook is covered.** A new bottom-docked surface has to call
  `useToastLift`; nothing detects one that forgets. `InlineActionButton`, the payment CTA, does not
  call it yet — no screen renders it.
- **The offset is a single `calc()`.** A malformed inset from the shell collapses it to 0, leaving
  the snackbar flush with the bottom edge — misplaced, not lost.
- **The viewer's close button is no longer under a toast**, which ADR-0155 accepted as a cost.
- Desktop is untouched: its `AppToaster` keeps its own top capsule and swipe-up on the same
  primitives.
- Sonner's in-app push banner stays at the top. It is a banner about something elsewhere, not a
  result of what the reader just did.

## Alternatives

- **Keep the snackbar at the top and restyle it only.** Rejected: the ask was the bottom, and the
  bottom is where a result toast is read on a phone — under the thumb that caused it.
- **Let the toaster read the route to know about the tab bar.** Rejected: it is mounted outside the
  router, and a route list would be a second copy of `BOTTOM_NAV_PATHS` that drifts. The bar that
  takes up the space is the one that knows it is there.
- **Detect the bars in CSS with `:root:has(...)`.** Rejected: it needs a marker on each bar anyway,
  and it trades an explicit, testable effect for selector support on older WebViews.
- **Keep the inverted light card in dark theme and darken the check.** Rejected: it would put a
  colour in the snackbar that is not in the design, to rescue a surface the design does not have.
- **Swipe sideways, as Material does.** Rejected: Radix takes one swipe direction per provider, and
  down is the direction the toast came from and leaves by.
