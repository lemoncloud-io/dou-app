# ADR-0164: A glass header holds its opaque pane while a page transition runs

> Status: Accepted · Decided: 2026-10-02
> · Scope: `libs/shared/src/hooks/usePageTransition.ts` ·
> `libs/web-ui-kit/src/composites/header/HeaderGlass.tsx`
> · The module docs are [shared](../../libs/shared/README.md) and
> [web-ui-kit](../../libs/web-ui-kit/README.md)

## Context

A glass header — `HeaderGlass`, behind `ChatRoomHeader` (the room, the thread, the invite wait) and
`ModalTopBar` (dialogs and full-screen forms) — is a 32%-opaque fill over a `backdrop-blur-xl` pane.
It does not switch its frost on: an opaque pane is painted first
and cross-fades to the frost over 300ms from the first frame, so the header stays legible while
WebKit composites the backdrop.

Entering a room mounts its header inside the view transition that slides the room in, and WebKit
does not paint `backdrop-filter` inside a view transition's snapshots. The cross-fade ran during the
slide anyway: the opaque pane faded out, the frost it was fading towards was not drawn, and for most
of the slide the messages under the header showed through its fill, sharp. When the transition ended
the frost arrived in a single frame. Frame by frame on an iOS 26 simulator: sharp through 270ms of
slide, fully frosted on the first frame after it — the header that "suddenly blurs" on entering a
room.

Blink paints the same frost inside the snapshots. In Chrome 154 a glass header mounted inside a held
root transition was exactly as blurred as one at rest, so the Android WebView never had this (measured
in headless Chrome on macOS; not re-checked on an Android device).

The kit cannot see navigation. web-ui-kit draws; `@chatic/shared`'s `useNavigateWithTransition` — the
one place apps/web starts a view transition — is what knows that one is running.

## Decision

1. **`useNavigateWithTransition` puts `data-page-transition` on `<html>` while a navigation runs**,
   counting overlapping navigations so that the attribute comes off only when the last one settles.
   A transitioning navigation settles after the transition's `finished`; one that does not transition
   settles within a microtask. Nothing is set on Android.
2. **A `HeaderGlass` that mounts while the attribute is present holds its opaque pane** until the
   attribute comes off, watched with a `MutationObserver`, and only then starts its cross-fade. The
   hold is capped at 1.5s.
3. **The attribute is the whole interface.** web-ui-kit does not import `@chatic/shared`. Each lib
   spells the name out, and both libs' tests pin the same literal.

## Consequences

- **On iOS the header is opaque for the slide** and frosts over 300ms after it, reaching the same end
  state as before: measured as a smooth ~280ms where it used to be one frame. Early in that fade the
  content behind shows faintly for about 100ms — the cross-fade's own mix of the two panes, which
  every mount has always had.
- **Only navigations through the hook are marked.** That is every view transition apps/web starts
  today, but nothing enforces it: a transition started some other way gets the one-frame frost back.
  A lint rule restricting the page-transition packages to `libs/shared` would turn this into a check.
- **A rename has to change both libs.** Each side's test catches a slip in its own source; nothing
  catches a rename carried out in one lib only.
- **A marker that is never cleared costs at most 1.5s of opaque header**, not a header that never
  frosts.
- **The header on the page being left is not covered.** Going back from a room, the room's header
  slides out in the old snapshot, which WebKit also draws without frost. That is how it was before.
- **It is the kit's one input a component reads in script rather than through a prop.** The kit
  already reads host state off `<html>` in CSS (`.dark`, `--safe-top`); this is the first component
  that reads it in an effect.
- Surfaces that draw their own `backdrop-blur` — apps/web's `PageHeader`, the floating tab bar, the
  composer — do not take part. If one shows the same end-of-slide frost, routing it through
  `HeaderGlass` is how it would.

## Alternatives

- **A prop threaded from each page through the header components.** Rejected: whether a page is
  mid-transition is known only to the navigation hook, and the prop would reach into components that
  otherwise take only what they draw.
- **web-ui-kit importing `@chatic/shared`.** Rejected: shared's barrel is bound to the DOM and the
  router (`react-router-dom`, `@chatic/assets`, `@chatic/config/react`), none of which the kit depends
  on or its jest setup resolves. The kit's workspace dependencies are `@chatic/ui-kit` and
  `@chatic/lib`.
- **Reading the page-transition library's own classes on `<html>`.** Rejected: the default iOS forward
  slide sets none. The library adds a class only for Android, an explicit animation, or a back
  navigation.
- **CSS variants on the two panes keyed to the attribute** (`[html[data-page-transition]_&]:…`), with
  no observer. Simpler, and it would also cover the header on the page being left. Rejected for now:
  it has no cap, so a stuck marker would leave every glass header opaque until a reload, and it turns
  an already-frosted header opaque the moment any navigation starts.
- **Marking on every engine.** Rejected once Blink was measured: on Android the hold would only delay
  the glass by the length of the lift.
