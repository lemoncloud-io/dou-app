# ADR-0336: Android screens move on a horizontal shared axis, and its system back animates

> Status: Accepted; decision 1 superseded by [ADR-0337](./0337-android-screens-slide-like-ios.md) · Decided: 2026-11-17 · Implemented: `feat/android-page-transitions`
> · Scope: `apps/web/src/pageTransitions.css` · `apps/web/src/app/navigation/useStackBack.ts`
> · The module doc is [apps/web page transitions](../../apps/web/docs/shell/page-transitions.md)

## Context

The app is one WebView, so every screen change is a web view transition started by `@chatic/shared`'s
`useNavigateWithTransition`, with keyframes from `@lemoncloud/page-transition-core`. On iOS that is a
slide from the right, which matches what the platform does and is left alone here. On Android the
package plays a "lift": both screens move 30px vertically and fade at the same time, over 450ms.

Two things about Android were off.

- **The lift is neither Android's motion nor clean.** Android moves between a screen and the one it
  opens horizontally — the system's own activity transition does, and Material's guidance for
  forward and back navigation is the shared axis on X. Vertical motion is Material's pattern for a
  stepper or a sheet. And because the two screens fade simultaneously, the middle of every transition
  shows both at half opacity on top of each other.
- **Back animated or not depending on which back.** The header's back arrow went through the hook and
  played the lift backwards. The system back — the button, or the gesture on newer phones — reaches
  the page as `OnBackPressed`, and `useStackBack` answered it with a bare `navigate(-1)`: the screen
  switched in one frame. On Android the system back is the one people use.

iOS has no such split: its back is WKWebView's native edge swipe, which animates on its own and
reaches the page only as a `popstate`, for which the page starts no transition.

## Decision

1. **On Android, a screen change is Material's shared axis X.** The incoming screen moves in 30px
   from the side it comes from and the outgoing one moves 30px the other way, on the emphasized curve
   over 450ms; the fade is a fade-through — the old screen is gone by 35%, and only then does the new
   one appear. Back runs the axis the other way. It is written in apps/web as an override of the
   package's `.android` rules, loaded right after the package's stylesheet, not as a change to the
   package.
2. **Android's system back plays the same back transition as the header's arrow.** `useStackBack`
   rewinds through `useNavigateWithTransition` instead of the router's bare `navigate`.
3. **iOS keeps the package's slide, and its swipe stays native.** Nothing on the page reacts to the
   swipe's `popstate` with a transition of its own.

## Consequences

- **No Android frame shows two screens.** At 35% both are transparent and the page background shows
  for a moment; that is what a fade-through is, and Material accepts it for the same reason.
- **The two platforms' back now agree with their forward**, and on Android the two backs agree with
  each other.
- **A quick second back press does not get its own motion.** Animating the system back made two
  presses inside one 450ms transition ordinary, and the package cannot run two at once (it clears
  every class it set when one finishes, the newer one's included). The second press navigates
  without motion under the first one's animation, and the back judgement counts a rewind from the
  moment it is asked for, so the second press cannot step out of the app either.
- **The override depends on import order.** It uses the package's selectors, so it wins because it
  loads later; moving it above the package's import in `main.tsx` silently restores the lift. A
  package release that renames its classes would also leave it inert — the slide's look is the
  package's, the Android look is now this app's.
- **Reduced motion is untouched.** The package's `prefers-reduced-motion` rule disables every view
  transition animation with `!important`, which outranks the override.
- **Predictive back is not wired.** The page hears about the system back only once the gesture ends,
  so there is no preview while it is held. Adding one would move back handling into the native shell,
  which is a separate decision.

## Alternatives considered

- **Keep the lift and fix only its double exposure** (fade-through on the vertical axis). Cheaper in
  look-change, but it keeps a vertical motion that no Android screen change uses.
- **Use the package's `slide` on Android too.** One motion everywhere, but it is the iOS gesture
  vocabulary — a full-width push with a dimmed parallax — and reads as a ported iOS app on Android.
- **Change the package.** It is shared with other apps that may want the lift; an app-level override
  keeps the decision where it was made.
