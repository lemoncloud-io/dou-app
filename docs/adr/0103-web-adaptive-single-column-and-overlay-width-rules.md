# ADR-0103: `apps/web` fills the device up to a phone-class bound, and notice dialogs opt out

> Status: Accepted · Decided: 2026-09-17
> Scope: `apps/web/src/styles.css` · `apps/web/tailwind.config.js` ·
> `apps/web/src/app/{ui/components,features/{home,onboarding,subscription,appUpdate,debug}}/**` ·
> `libs/ui-kit/src/components/ui/{dialog,alert-dialog}.tsx` ·
> `libs/web-ui-kit/src/composites/{layout/ScreenLayout,overlay/AlertDialog}.tsx` ·
> `libs/web-ui-kit/.storybook/preview.ts` · `apps/web/docs/shell/layout-shell.md` · `DESIGN.md` ·
> `libs/ui-kit/README.md`
> Related: [ADR-0011](./0011-web-layout-shell-and-floating-bottom-nav.md) (the mobile shell whose one-column rule this
> re-scopes)

## Context

`apps/web` was drawn for one device shape. `--app-width` was 430px and meant "the width a phone
is", so every screen, sheet, dialog and floating bar rendered at that width and centred on anything
larger. Beneath it sat Figma's 375 frame translated to fixed px, and there was no responsive
infrastructure at all: no media queries, no breakpoint utilities, no viewport-width hook. Storybook
framed every story at 390.

Two device classes the shells already accept were therefore unserved.

A foldable unfolded is roughly 650–720px, and the native shells hand that width to the WebView
without recreating the activity, so the change arrives at runtime as an ordinary resize. What the
user saw was a 430px column standing in the middle of the device with empty margins either side —
opening the phone made the app look smaller.

At the other end, 320–344px devices (an older phone, a foldable's cover screen) had rows whose
fixed px add up to more than the device has.

Separately, notice dialogs had drifted. The same confirm card was `max-w-[288px]` in five places,
`w-[311px]` in two and `max-w-[300px]` in one, because each call site carried its own width.

The constraint over all of it: `libs/ui-kit` and `libs/web-ui-kit` are shared with
`apps/desktop-web`, which must not move by a pixel.

## Decision

### 1. `--app-width` keeps its name and gains a new meaning: 768px, the upper bound of the phone class

Not "the width of a phone". Every surface fills the device it is on and stops there. Below the
bound the column _is_ the device, and that deliberately includes widths no phone has. Above it — a
tablet, a desktop browser following an invite link — it caps and centres, exactly as before.

Nothing about how the value is read changes, and that is the point of keeping one variable: six
call sites already read it, and one edit moved all six. 768 borrows the conventional tablet
boundary rather than introducing a number of our own.

`ScreenLayout` in `libs/web-ui-kit` carried a second cap at `screen-sm`. Two caps mean some screens
stop at 640 and others at 768. It reads the same variable now, with a fallback equal to its old cap
so a host that declares nothing is unaffected.

### 2. The column fills; what is inside it has bounds

A wider column is not automatically better for everything inside it. Rather than restructure by
width, individual elements take a `max-width`:

- **Read-only prose** (onboarding copy) caps at 480px and centres. A 690px measure runs a line of
  Korean past the point where a paragraph is read rather than scanned.
- **Message bubbles** keep their existing 75%-of-row rule. No second bound — one rule is enough.
- **Form fields and primary actions** fill the column. A wide input costs nothing, and bounding it
  would leave the call to action stranded mid-screen.

### 3. Viewport units are not used inside the column

Column width and viewport width are different numbers the moment anything caps, which was already
true on every device wider than 430. The onboarding carousel sized its track and steps in viewport
units, so past the cap each step was wider than the frame holding it and the next step bled in at
the edge. Percentages of the track hold at every width.

The only viewport units that remain legitimate are a `fixed` overlay positioning itself against the
viewport it is actually attached to.

### 4. Overlays split three ways

- **Bottom sheets and full-screen dialogs follow the column.** A sheet fills an unfolded foldable,
  which is what that form factor does natively, and the wiring already did this — the value change
  carried them.
- **Notice dialogs do not follow the column.** A confirm card stretched to 768px stops being a
  card. `dialog` and `alert-dialog`'s `default` variant declare
  `--dialog-width: min(311px, calc(100% - 48px), var(--app-width))`: 311 is the design width, and
  `100% - 48px` keeps 24px either side once the device is narrower than the card. The eight
  disagreeing call-site widths are deleted; 311 wins over 288 because widening a card by 23px is
  invisible while narrowing one moves away from the design.
- **Popovers and dropdowns anchor to their trigger**, neither the column nor the viewport.

The scoping deserves its own note, because it is what makes a width rule safe to put in a library
shared with a desktop app. The third `min()` term reads `--app-width` **with no fallback**. In a
host that declares no app width the whole declaration is invalid, `--dialog-width` never resolves,
and `max-width` falls back to the original `32rem`. The desktop host is excluded structurally, not
by anyone remembering to check it.

### 5. CSS decides layout; JavaScript does not measure width

Folding, unfolding and rotating are viewport resizes, and they were confirmed to arrive as ordinary
`resize` events. Nothing new listens for them, because nothing needs to.

No component is swapped on width (`isWide ? <A/> : <B/>`). That is a correctness property, not a
style preference: swapping would unmount whatever is on screen, and a half-typed message would
disappear at the exact moment the user opened their phone to get more room for it.

Width measurements taken once at mount are removed. The settings popover placed itself with
`window.innerWidth - rect.right`, read when it opened — a number that is stale one gesture later,
leaving the panel where its button no longer is. Anchoring it to the trigger expresses the same
intent as a relationship rather than a reading. Re-measuring on resize would have been the worse
fix; not measuring is always correct.

### 6. Verification is visual, and says so

jsdom does not perform layout, so none of the above is provable by unit test. Rather than pretend
otherwise, two things are fixed in place: Storybook viewport presets at 320 / 344 / 360 / 390 / 690
(default unchanged at 390), and a device matrix of before-and-after screenshots required in the
pull request. Two greps guard the regressions that are cheap to detect — viewport units inside the
column, and literal `430`s left behind.

## Alternatives considered

**Breakpoints and a two-pane layout on an unfolded foldable.** This is what `apps/desktop-web`
does, and it is the reason it stays a separate app: list-plus-room restructuring drags routing and
shared state with it. It also forfeits the state-preservation property of §5.

**A lower cap, around 600px.** Safer for line length, but it leaves visible empty margins on an
unfolded device, which is the complaint that started this. Bounding what is inside the column
(§2) addresses line length without giving up filling the device.

**Fluid typography.** Rejected. Type scale belongs to the design system, and scaling it by width
would put every screen slightly out of step with Figma at every width.

**Unifying notice dialogs at 288 rather than 311.** Rejected: it is the direction that moves away
from the design for the two dialogs that cite Figma directly.

**Declaring the dialog width in the app's stylesheet instead of the variant.** Would have worked
and been simpler to read, but it puts the number back where call sites can reach it. Declaring it
on the variant means a call site has to actively override to get it wrong.

## Consequences

**A single value now controls how wide the app is.** That is the benefit and the risk: the six
readers follow automatically, and a seventh surface that hardcodes a number instead will drift
silently. The `430` grep exists because this already happened once.

**`tailwind-merge` makes the dialog rule opt-out-able by accident.** A call site that adds any
`max-w-[…]` wins the merge and quietly leaves the shared rule. Nothing fails loudly. This is the
specific mistake to look for in review of a new dialog.

**`SubscriptionRequiredDialog` is a known duplicate.** It is a hand-rolled portal rather than a
`DialogContent`, so it cannot inherit the variant and repeats the expression with a comment saying
so. Moving it onto the shared primitive would remove the duplication and is worth doing separately.

**The desktop invariant is now structural but still shared.** `apps/desktop-web` is protected by a
fallback rather than by separation, so any future edit to these primitives has to preserve the
no-app-width path. The existing convention — every use of the variable falls back to prior
behaviour — is what carries that, and it is worth more than it looks.

**Tablet and desktop layouts are explicitly not designed.** Past 768 the app caps and centres. It
does not break, and it is not addressed; a real tablet layout is a separate decision.

**Chat surfaces were left alone deliberately.** `apps/web/src/app/features/channels/**` was owned by
an in-flight branch while this work landed, so the shared primitives were changed in a way those
screens inherit without editing them. One notice dialog and the link preview there still carry
their own widths and follow separately.
