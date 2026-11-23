# Chrome, focus and banner notes — the reasoning behind `app/ui/`

> Scope: `apps/web/src/app/ui/`. The layout rules (spacers, snackbar lift, composer inset) are in
> [layout-shell.md](./layout-shell.md); the keyboard return key and tap-to-dismiss are in
> [return-key.md](./return-key.md) and [keyboard-dismiss.md](./keyboard-dismiss.md). This page holds the
> pieces those do not cover.

## Who owns the notch inset

A glass header only looks glass if it reaches the top edge. An inset applied by the _parent_ sits above
the header's fill and leaves a bare strip across the notch, flat next to the frosted bar below it —
and on an overlay layout it is a window that content scrolls through unblurred.

- `PageHeader` takes the inset itself (`safeArea`, on by default, as `var(--safe-top)` plus 0.75rem of
  padding). A screen that uses it pads nothing above it. Turn it off only where something else already
  applied the inset and the gap would double.
- `KeyboardAwareLayout` has the matching switch, `headerSafeArea` (default `true`, which suits a plain
  header that draws nothing). A screen whose header paints a glass bar passes `false`. Several mypage
  screens (profile edit, cloud edit) and the settings pages do exactly that, and the settings-style
  pages are the scroll port themselves so their sticky bar keeps the notch strip frosted.
- The slide-up place-profile dialog drops the dialog variant's built-in top and bottom padding. On top,
  the frosted bar carries the inset itself; otherwise an opaque band sits above the glass and only the
  bar itself looks frosted. At the bottom, `KeyboardSafeAreaSpacer` under the CTA already reserves
  `max(safe-bottom − padding, keyboard-height)`; keeping both applies the home-indicator inset twice and
  floats the CTA a full inset above the keyboard. Both are removed with an inline style rather than a `pb-0` class because `pb-safe-bottom` is a
  custom spacing key that `tailwind-merge` does not classify as bottom padding, so both classes would
  survive and utility order would decide.
- `fixedViewportScreen` is the class list for a route page that lifts itself out of the document flow
  (`fixed inset-0 mx-auto max-w-app`). `fixed` escapes the app shell and its width cap, so the page has
  to re-declare the cap or it alone would stretch across a desktop viewport.

## `useChromeInsets`: first paint and the border box

The scaffold lays a full-bleed body under a floating header and footer, so the chrome heights have to
come back in as body padding.

- Each chrome element is measured **synchronously, once** in a layout effect, before `ResizeObserver`
  is trusted. The observer's first callback arrives a frame late; relying on it alone paints the body
  once with zero insets (content under a header that has nothing to blur) and then jumps about 60 px.
  A `WeakSet` guards the forced layout read so it happens once per element and not on every render of
  a long message list; it is per element because a footer can mount on a later render.
- Heights are the **border box**, and the observer is told `box: 'border-box'`. The chrome carries
  its insets as padding (the header's safe-top, the composer's keyboard and home-indicator padding), which
  a content box leaves out — that under-report is what left the last chat message unreachable behind a
  raised keyboard. A keyboard opening only changes the composer's padding, so a content-box observer would
  not even fire.
- `followFooter(fn)` hands footer size changes to `fn` instead of a render until it is called with
  `null`; letting go measures the footer once and renders, so the page and the follower land on the
  same final height in the same frame. See layout-shell for the attach-panel slide that uses it.

## `useAutoScrollOnFocus`: the readable band

When a text field takes focus on a touch device, the page waits 300 ms (the keyboard is still animating
in) and, if the field is outside the readable band, scrolls so the field's centre is the band's centre.
A desktop keeps its native caret-into-view behaviour (gated on `navigator.maxTouchPoints`).

- The band is the viewport minus the soft keyboard and the docked chrome that overlaps its edges.
  `KeyboardAwareLayout` floats header and CTA panel _over_ the scrolled body (`data-chrome-root` and
  `data-chrome-overlay`), so a field can be inside the viewport and still covered by one. Only the
  field's **own** scaffold counts: a bottom sheet over such a page has no chrome root, and the page's
  CTA behind it must not shrink the sheet's band.
- The keyboard enters the band as a `min` with `--keyboard-height`, not a subtraction. Where
  `visualViewport` already reports the shrink the two agree; where the WebView leaves the viewport alone
  and injects the variable instead, the variable is the only signal, and without it a sheet's field buried
  under the keyboard would count as readable.
- It scrolls by the measured offset rather than `scrollIntoView({ block: 'center' })`, which centres in
  the scroller's own box — and that box runs under the keyboard and the docked CTA.

## `useKeyboardOpen`: two signals, whichever reports more

A native WebView does not shrink under the keyboard and fires no event at all: the shell only sets
`--keyboard-height` on the root. The hook lets layout do the listening — a fixed, zero-width,
off-screen probe is sized by the variable and watched with a `ResizeObserver`. A plain browser has no
variable, but its visual viewport shrinks, so the hook also reads `window.innerHeight - visualViewport.height`
on `resize` _and_ `scroll` (iOS moves the visual viewport as the keyboard settles, and the mid-animation
height lands on the scroll event). The larger of the two wins, and anything under `KEYBOARD_MIN_PX`
(120) is not a keyboard: a collapsing URL bar or an iOS accessory bar moves the viewport by less, and
reacting to it would flicker the layout. The probe is `visibility: hidden`, never `display: none` — a
hidden box is still laid out and observed, a displayless one has no size to report.

## The foreground push banner

`InAppNotificationCard` is the content of a Sonner custom toast for a push that arrives while the app is
open.

- It follows the theme (popover tokens, 82% opacity and a 5 px blur) instead of the UI kit's
  deliberately inverted toast, so the screen underneath stays faintly legible: the interruption reads
  as an overlay on what you were reading, not a lid. One tight shadow only — a heavier one made a
  transient banner look like a modal.
- Nothing in the card animates: the drop-in and swipe-up dismissal are Sonner's own for a `top-center`
  toast, so the two cannot fight.
- The time label is the fixed word "now" (`notifications.inApp.now`): the push has just arrived, there is no
  relative time to compute, and nothing ticks in a banner that lives a few seconds. It stays
  `shrink-0` so a long title truncates instead of squeezing it out. The body is one ellipsised line —
  the banner points at the message, the room shows it. Title and body use the same `text-label` ink, the
  timestamp at half opacity, so the ranking holds in dark mode, where label and description collapse to
  one hue.
- A card with no routable payload is display-only. A foreground push always keeps the time label even
  when it has no body.
- How a route transition retires the banner is in [history-stack-rules.md](./history-stack-rules.md).

## Import graph traps

- `ui/components/index.ts` does not re-export `CountrySelect` / `CountrySelectSheet`: the barrel is
  imported eagerly all over the app, and they pull libphonenumber's metadata (about 100 kB raw) into the
  initial chunk. Their two consumers import the concrete files. The same holds for
  `utils/phoneNumber`.
- `utils/index.ts` also leaves out `buildEnv` and `webVitals`, which read `import.meta.env`; Jest's
  CommonJS transform cannot parse it, so a re-export would break every test that touches the barrel. Under
  Jest `buildEnv` is mapped to a stub that answers as a production build (`apps/web/__mocks__/`); a test
  that needs a development build mocks it itself. `webVitalsStore` stays in the barrel because it holds
  the values the debug overlay reads and touches no build-time env.
- For the same reason, specs and a few components import `PageHeader` and friends by concrete file
  path rather than through the `ui/components` or `ui/layouts` barrels, which reach `libs/shared` and
  `web-core`.

## Smaller component notes

- `CountrySelect` ships trigger and sheet as one component, so a screen wires a country with a single
  prop and never adds a sibling node beside its form — `ContactInvitePage` renders one fixed child
  list on purpose, since a branch that shifts child indices would unmount the live `PhoneVerifySheet`
  mid-promotion. An empty country is a state, not an error: nothing to validate against, so the CTA is
  disabled and the trigger shows a placeholder. The sheet builds its 245 rows only while open, and
  starts each opening from the whole list (a stale filter would look broken).
- `VerificationCodeInput` accepts any non-space character and uses the text keypad only in a
  development build, because development deployments recognise a non-numeric bypass code that a
  digits-only filter made untypeable (a numeric keypad has no `#`). Release builds keep the digit
  filter and the numeric keypad.
- `PlaceProfileForm` seeds its fields from the initial values only on the closed-to-open transition,
  and latches until it closes. The edit flow's initial values come from an observed cache that can emit
  again while the screen is open (background sync, a late first load), and re-seeding would clobber the
  user's in-progress edits; the page container is open from mount, so it latches once. A submit that
  commits more than the profile (place creation saves the place first) rejects with an error carrying
  `userMessage`, because a profile-save message would be the wrong thing to tell.
- `SettingsControl`'s settings panel positions the panel against its trigger with
  `absolute right-0 top-full` instead of measuring `window.innerWidth - rect.right` once at open, which
  goes stale as soon as the viewport changes width (a foldable is a gesture away).
