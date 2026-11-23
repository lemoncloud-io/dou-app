# Foundations

Base components in `src/foundations/` and the icon set in `src/resources/icons/`.

## Buttons

- `Button`: the pill button every preset extends. `tone` defaults to green for `solid` and neutral gray for
  `outline` and `ghost`. `loading` shows a spinner and blocks presses.
- `buttonSurfaceClass` (the exported class set): lets a non-interactive twin look identical. Use it only for that;
  anything clickable is a `Button`.
- `SubscriptionButton` and `SubscriptionBadge`: the same tier pill, as a button and as a `<span>`. The badge exists
  because the pill sometimes sits inside another button, and nested buttons are invalid HTML and cut a dead zone out
  of the parent's tap target. `size="xs"` is the tighter pill used inside dropdown rows.
- `SubscriptionBadgeSkeleton`: a pulse of the pill's own size while the tier is undecided. Guessing FREE and
  flipping to PRO tells a paying user the wrong thing, and an empty slot makes the pill pop in. It is hidden from
  assistive tech.
- `FloatingButton`: full-width call to action on a panel with an upward shadow; the `link` slot is an optional
  sub-action under it. `InlineActionButton` is the payment variant (price on the left, fixed-width black button).
  Both share one panel surface.
- `TextLink`: renders an `<a>` when `href` is set, a button otherwise.

## Inputs

- `MessageInput`: the chat composer. Grows from a single-line pill to a rounded rectangle up to `maxHeight`, then
  scrolls. `sendReady` lets the send button go live with an empty field (photos wait in the attach strip), and
  `onSend` then receives an empty string. `leadingSlot` is a slot so the component never learns what attaching is.
    - Tapping composer chrome (padding, the send button) must not blur the textarea and drop the soft keyboard, so
      `pointerdown` and `mousedown` are cancelled, never `touchstart`: iOS WKWebView moves focus on the
      `mousedown` default action, and cancelling `touchstart` would suppress the click that sends.
    - The idle send button is `aria-disabled`, not `disabled`: a disabled control gets no pointer events, so the
      keep-the-keyboard handler would never run. The real attribute is only used when the whole composer is
      disabled.
    - The composer uses `touch-action: manipulation` so rapid repeat sends are plain taps, not double-tap-zoom
      candidates that made send-send-send drop the keyboard.
- `ComposerAttachButton` shows `+` closed and `×` open, so the same spot closes what it opened.
  `ComposerLockButton` takes the same slot and shape when the composer is locked.
- `TextField`: `maxLength` shows an "N/max" counter and caps typing; `enforceMaxLength={false}` keeps the counter but lets
  the value exceed the cap, so an over-limit state like 21/20 is reachable. `leading` and `trailing` sit inside the
  border, so a focusable control there lights the whole field's focus ring. `helperTrailing` renders the helper row
  even with no helper text. `error` overrides `description`.
- `Textarea` has no character counter on purpose: a visible cap reads as pressure on long-form input. Callers that
  need a hard cap clamp in `onChange`.
- `VerificationCodeInput`: one transparent field over the digit cells. `allowNonDigits` (printable, non-numeric)
  exists for a backend that accepts a non-numeric bypass code on development deployments. The host decides when it
  is on; the kit never reads the build environment, so a production code field cannot be widened by accident. It
  also drops the numeric keypad. Whitespace is stripped either way because pastes carry it.
- `PhotoAttachField` hands raw `File`s back without enforcing `max`, so the caller can say why a pick was refused.
  Encoding and size policy stay with the owner. It clears the input value first so picking the same file twice
  still fires `change`.

## Avatars

- All avatars draw through one circle whose 1px stroke is a separate top layer, the way Figma paints an inside
  stroke: the photo keeps the full diameter. Layers share a grid cell instead of absolute positioning so the
  frame stays unpositioned and does not paint over overlapping siblings such as a "+N" chip. A host `ring-*` still
  works.
- `DefaultAvatar`: brand-ink disc with a white glyph, for a member with no photo. For a grey placeholder on a
  light surface use `IconUserOutline`. There are exactly two images, `user` and `group`; no outline variant.
- `CloudAvatar`: initials on a colour derived from the name, so a cloud keeps its tone. The eight-colour palette
  is a rotation, not a meaning, so it has no semantic token. `xl` is the identity head on cloud management screens.
- `PlaceAvatar`: every place uses the same single tone; a missing name draws a home glyph. It matches
  `CloudAvatar`'s initial scale so the two align in a list.
- `ProfileAvatar`: `glyph` picks the empty state. `user` and `group` are dark discs, `place` is the illustrated
  landscape (a place is a space, not a person), and `home` is the DoU character inset on a light disc, with no
  stroke, because the relay default place stands for the service. The "+" badge inverts against the disc: light on
  the dark placeholders, dark on `home`.
- `AvatarGroup`: the host passes already-ringed nodes (accent ring for self, surface ring for others) and owns the
  me-versus-others treatment. `count` defaults to `avatars.length`; `avatars=[]` with `count=1` shows only the
  number (the "group with only me" case).

## Badges and chips

- `UnreadBadge`: `accent` is the bare number beside a timestamp, `pill` the filled chat-list badge. The pill uses a
  pink on purpose, distinct from the green accent. Renders nothing at 0; above `max` it reads `+max`.
- `ActivityCountBadge`: how many of the unread are mentions or thread replies. Renders nothing at 0.
- `StatusBadge` variants: `owner` accent, `pending` muted, `mine` dark, `expired` muted (also used for a declined
  invite, since the backend has no separate declined state).
- `CloudStatusBadge`: `provisioning` blue, `failed` red, `ending` orange (ends at the next renewal), `restricted`
  grey with an alert glyph (grey alone does not read as a warning). Tints are `hsl(var(--token)/0.08)` literals
  because the kit's colours have no alpha slot for the opacity modifier.
- `PlaceChip`: the current place is the filled chip that shows its name; the others fold to disc and unread pill.
  The name stays mounted and folds through a `0fr` to `1fr` grid track so it can unfold without measuring.
  A transparent hairline stays on the filled chip so the row does not shift by a pixel mid-animation.
- `FilterChip` reports `aria-pressed`; `check` is for the unread-only toggle only.
- `PlanBadge` accent outline is for paid tiers. `VerifiedBadge` defaults to 18px.

## Bubbles and audio

- `MessageBubble`: the root is the named group `group/bubble` with `data-variant` (`mine` is navy in both themes).
  Content such as `CodeBlock` reads it to pick a tint for its ground. Inside an ancestor marked `data-highlight`
  (a message jumped to), the light bubble gets the page ground and an inset lime ring, which moves nothing.
  Long tokens wrap with `overflow-wrap: anywhere`, the only value that also shrinks min-content width.
- `AudioSeekBar`: a native range input lies over the drawing and takes every gesture, so dragging and arrows behave
  as the platform slider does. A drag reports where it is through `onScrub` and seeks once, when it ends. Unknown
  or zero `duration` draws a resting, undraggable bar.
- `PlaybackRateChip` only shows a speed and reports a press; which speed comes next is the host's rule.
- `audioFormat`: `0:07`, `35:47`, `1:12:05` (fractions dropped, not rounded, so a clock never shows an unplayed
  second); sizes are always one-decimal megabytes (`0.3MB`) with no unit switching.

## Brand and text

- `BrandWordmark` renders both colour variants and hides one with CSS, so the theme swap needs no hook or
  re-render; the accessible name sits on the wrapper for that reason. `BrandMark` composes the character and
  wordmark, with the design's 97:62:20 proportions and pixel-rounded lengths.
- `Checkbox` `tone`: `primary` is the green "CheckBox", `accent` the chat-management check circle, `ink` the
  notification selection check. They are separate tokens. `interactive={false}` draws a `<span>` for a parent that
  owns the click.
- `Toast` is presentational; the host owns show, hide, timing and position.

## Icons

- `src/resources/icons/index.ts` is the only file that imports `lucide-react`; components import `Icon*` aliases.
  An alias without a current caller staying exported is normal.
- Figma-exported glyphs are one component per file, fill `currentColor`, and take `size` in pixels.
- `NavIcons` and `NotifyGlyphs` do not reproduce the design's masked 3px stroke. The app sets a `<base href>`
  and engines resolve a `url(#…)` mask reference against it, so the icon vanishes on any page that is not the
  base path. Instead the path is shrunk about its centre and the stroke widened by the same factor so a plain
  stroke lands where the masked one did.
- `FileKindIcons`: each kind carries a short format tag knocked out of the sheet, because colour alone fails a
  reader who cannot tell red from green. A generic file has no tag.
- `IconPlaySolid` is nudged right of the box centre on purpose; a box-centred triangle looks left-heavy.
