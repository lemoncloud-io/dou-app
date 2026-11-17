# page transitions — how one screen gives way to the next

A screen change inside the app animates the way the platform does: on iOS the new screen slides in
from the right over the old one, which drifts left and dims; on Android the two screens move 30px
along a horizontal axis and fade through each other. Going back runs the same motion in reverse. A
tab switch, a `replace`, and anything under the system's reduce-motion setting do not animate.

There is no native screen transition behind any of this. The whole app is one WebView, so every
animation is the web's own, drawn with the View Transitions API: the browser snapshots the screen
being left, lets the page render the next one, and animates the two pseudo-elements. The one native
motion is iOS's edge swipe, below.

## Who starts one

Every navigation that should animate goes through `useNavigateWithTransition` from `@chatic/shared`
— nothing in apps/web calls `document.startViewTransition` itself. The hook takes react-router's
`navigate` arguments plus four of its own:

| Option          | Default                               | Effect                                                     |
| --------------- | ------------------------------------- | ---------------------------------------------------------- |
| `transition`    | `true`, except `false` with `replace` | whether to animate at all; the tab bar relies on `replace` |
| `direction`     | `back` for a negative history delta   | which way the motion runs                                  |
| `animation`     | the platform's                        | force `slide`, `lift`, `fade`, `zoom` or `none`            |
| `customization` | none                                  | per-navigation duration or easing                          |

The platform comes from `CHATIC_APP_PLATFORM`, which the shell injects at boot. In a plain browser
there is none, and the package guesses from the user agent.

## The capture waits for the destination

The browser captures the incoming screen as soon as the transition's update callback settles. A
navigation does not render synchronously: the router updates its state inside `navigate`, but React
renders that state in a later task, and a history move (`navigate(-1)`) does not even reach the
router until the browser has moved entries and fired `popstate`. A callback that only calls
`navigate` therefore settles while the old screen is still the DOM, and the "new" snapshot is the old
screen. That was the case for every back arrow until the hook waited: for the first frames the room
slid out over a copy of itself, and home snapped in underneath mid-way.

So the update callback now resolves on the first DOM change after the navigation, or after 300ms,
whichever comes first (`waitForDestination` in `@chatic/shared`). For a history move, "after" means
after the entry changed, which it reads from `history.state` rather than from `popstate`: the router's
own `popstate` listener runs first and React commits the route in the microtasks right after it, so a
listener of ours would arrive after the very change it was waiting for. React commits a route in one
pass and the change is reported after that pass, so what is captured is the committed destination —
unless something unrelated (a message arriving, a toast) changes the DOM first, in which case the
capture is as early as it always was.

Measured in Chrome with the guest's Self Chat: the back arrow's capture moved from 2ms after the tap
(the room, before `popstate`) to about 45ms (home, on its first commit); a push into the room captures
at about 90ms, as it already did when React won its race to the frame.

The page does not paint during that wait — the reader keeps seeing the screen they tapped on — so
300ms is a ceiling on a freeze, reached only by a navigation that renders nothing (`navigate(-1)` with
nothing behind it, a navigation to the screen already shown).

One case still captures early: a lazy route whose code has not loaded yet. React commits its Suspense
fallback first, the wait ends on that, and the fallback is what slides in; the screen fills when its
code arrives. `channels` is preloaded once the app goes idle ([routing.md](./routing.md)), so a room
rarely hits this; the other lazy groups can on their first visit.

## Back, by platform

| Back                             | Platform | What moves                                                                                   |
| -------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| The header's back arrow          | both     | the back transition, through the hook                                                        |
| The system back button / gesture | Android  | the same back transition: `useStackBack` rewinds through the hook                            |
| The edge swipe                   | iOS      | WKWebView's own swipe (`allowsBackForwardNavigationGestures`); the page only sees `popstate` |

The iOS swipe is native: the WebView slides a snapshot of the previous page under the finger and fires
`popstate` once the swipe completes. The page starts no transition for a `popstate` it did not cause,
so the swipe is never followed by a second, web-drawn slide. Android's system back reaches the page
as `OnBackPressed` instead (see [routing.md](./routing.md) for the judgement), and before it rewound
with a bare `navigate(-1)` — the screen switched with no motion while the arrow on the same screen
slid.

Two back presses in quick succession are ordinary on Android, and two things keep them sane:

- **A navigation that arrives while a transition is running does not start a second one.** It
  navigates without motion, under the running animation (whose incoming screen is live, so it shows
  the newer destination), and only after the running transition has itself navigated, so the two land
  in order. A second transition would break the first: the package clears every class it set when a
  transition finishes, including those of a newer one still running, which would drop the rest of its
  motion to the iOS slide.
- **A rewind is counted from the moment it is asked for.** `canGoBackInApp` subtracts rewinds that
  have not landed yet (`noteRewindStarted` in `app/navigation/stackDepth.ts`), because the transition
  moves the browser a frame or more after the press. Without it, two presses on the screen right above
  the first one both read "one entry behind", and the second stepped out of the app.

## The animations

`@lemoncloud/page-transition-core/styles.css` holds the keyframes and is imported first in
`main.tsx`; `src/pageTransitions.css` is imported right after it and replaces the Android rules.

- **iOS — the package's slide.** New screen in from 100%, old one out to -30% and to 93% brightness,
  350ms on `cubic-bezier(0.32, 0.72, 0, 1)`.
- **Android — Material's shared axis X, this app's.** The package's own Android animation was a
  vertical "lift" with both screens fading at once, which double-exposed them at half opacity in the
  middle of every transition. The override moves the incoming screen in from 30px on the side it comes
  from and the outgoing one 30px the other way, on Material's emphasized curve over 450ms (the
  package's lift variables, so `customization` still applies). The fade is a fade-through: the old
  screen is gone by 35% and only then does the new one appear, so no frame shows both. Movement and
  fade are two animations on each pseudo-element because a keyframe stop inside one would restart the
  slide's easing.

The override uses the package's own selectors, so it is the import order in `main.tsx` that makes it
win, not specificity. Keep it directly after the package's stylesheet.

## Reduced motion

The package's stylesheet turns every view-transition animation off under
`prefers-reduced-motion: reduce`, with `!important`, which also outranks the Android override. The
navigation still runs through the transition, so it still waits for the destination; it just swaps
the screens in one frame.

## Not covered

- **iOS before 18** has no View Transitions; navigation there switches screens with no motion.
- **Android's predictive back** (the preview while the gesture is held) is not wired. The page is
  told about back only once the gesture has finished.
- **Tabs** switch with `replace` and do not animate, as tabs do not natively.

## Verify

```bash
../../node_modules/.bin/jest -c jest.config.js --no-watchman src/hooks/usePageTransition.test.ts src/hooks/waitForDestination.test.ts   # in libs/shared
../../node_modules/.bin/jest -c jest.config.js --no-watchman src/app/navigation/useStackBack.test.ts      # in apps/web
```

What the tests cannot show is the capture itself. To see it, wrap `document.startViewTransition` in a
page script that records `location.pathname` and the DOM when `ready` resolves — the moment the new
state has been captured — and tap a room's back arrow: the record must show home, not the room. The
pane of the desktop app's browser cannot run this while it is hidden (a hidden document skips view
transitions); a headless Chrome over CDP can.
