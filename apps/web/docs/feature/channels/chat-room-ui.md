# chat room ui — layout and gesture constraints in the room's components

The room, the thread and the dialogs around them are drawn in a WebView, on phones, with a list that
is `flex-col-reverse` and a bubble that is also a gesture target. The rules below are the ones whose
removal looks harmless and breaks on a real device. The behaviour of each surface is in
[chat-room.md](./chat-room.md); this file only records what the markup must keep doing.

## Gestures on a message

- **A touch never cancels `pointerdown`.** Only a mouse does (so a drag does not select text).
  Cancelling it on touch cancels the browser's own panning for that gesture, and a thread is mostly
  bubbles, so the list stopped scrolling wherever a finger landed on one. Selection and the iOS
  callout are suppressed in CSS instead (`select-none`, `-webkit-touch-callout: none`) on every
  long-press target: the text bubble and the image tiles.
- **Drift is the hold's cancel, not `pointerleave`.** A touch implicitly captures the pointer, so a
  finger that scrolls away from the bubble fires neither `pointerleave` nor `pointercancel` until it
  lifts. Without the `MOVE_CANCEL_PX` check on `pointermove`, the hold would mature mid-scroll and
  open the sheet on a flick.
- **The tiles swallow the click that ends a hold.** The swallow is armed by a hold or a right-click
  and is read in the capture phase, before the tile's own handler. A keyboard activation
  (`detail === 0`) has no pointer behind it, so it ignores the flag; otherwise a flag left by an
  earlier right-click would eat the Enter that opens the photo.
- **The copy button of a code block stops the gestures that start, not the ones that end.**
  `MessageCodeBlock` stops `pointerdown` and `contextmenu` from reaching the bubble, so a press on
  the button never starts the hold. It does not stop `pointerup`, `pointerleave` or `pointercancel`:
  the bubble uses those to clear its timer, and a press begun on the code text and released on the
  button would otherwise fire the sheet. Touch hides this (implicit capture retargets the release);
  a mouse reproduces it. Only `stopPropagation`, never `preventDefault`: the click must still reach
  the button and the browser must still synthesise it.

## Sizing inside a row

- **The bubble's row is `w-full`, not shrink-to-fit.** A fenced block's line has no break opportunity,
  so its min-content width is the whole line, and min-content beats a `max-width`: one long code line
  made the bubble wider than the screen. Pinning the row to the column gives the bubble's `max-w-full`
  something definite to resolve against, and the block scrolls inside the bubble. My side uses
  `justify-end`, since the column is wider than the bubble whenever chips or the thread footer are.
- **Flex items on the row carry `min-w-0`.** A flex item defaults to `min-width: auto`, its
  min-content width, which beats `max-width`: a long unbroken message would push the bubble out of
  the row. The same holds for the image wrapper, which would otherwise keep the tile grid's fixed
  width and overflow the 75% column on a narrow screen.
- **A Block Kit card is `bg-card`, not `bg-surface`.** In the dark theme `--surface` equals the page
  background, so a surface-filled card has no fill. `--card` separates the card from the bubble
  beside it in both themes; against the page it reads as a card only in dark, and in light the border
  carries it, as every other card in the app does. The card is drawn without a bubble because a
  webhook send is not someone speaking, and Block Kit brings headings, rules and a field grid that do
  not read as speech.
- **`ConfirmDialog` breaks a long description with `overflow-wrap: anywhere`.** The dialog quotes
  message text, so the description can be one unbroken run (a URL, an id). `break-words` wraps it but
  leaves the run's min-content width, so the panel and the button row stretched past a 375px screen
  and the confirm button was unreachable; `anywhere` shrinks the min-content too.
- **`ConfirmDialog` takes `closeOnConfirm`.** Its action button is Radix's close primitive, so a press
  closes the dialog before the work it started can report as pending. A caller that drives
  `isPending` (the message delete) passes `closeOnConfirm={false}`, which cancels that close, and
  closes the dialog itself when the work settles; otherwise the spinner and the disabled buttons are
  unreachable.

## The list

- **The header clearance is a spacer element at the end of the list, not padding.** In a
  `flex-col-reverse` scroller the content overflows toward the top, and WebKit leaves padding on that
  side out of the scrollable overflow: a thread taller than the viewport by less than the header
  reported `scrollHeight === clientHeight` and did not scroll, with its oldest message stuck behind
  the header. The bottom padding (the composer's measured height) is the scroller's start edge and is
  honoured, so it stays padding. The spacer's height subtracts the list's `gap-3`, which already sits
  between it and the first row.
- **A short list reads from the top through a growing spacer, not `justify-end`.** A `flex-1` first
  child sits at the visual bottom and absorbs the free space; it collapses as messages overflow.
  `justify-end` would clip overflowing content. The empty room carries its clearance as its own padding
  instead, because a spacer there would overflow a `min-h-full` box with nothing to scroll to.
- **The loading skeleton has a fixed shape and starts at the top.** A random shape would itself flicker
  each time a room opens; the widths are in the range real bubbles land in, so the swap to messages
  does not jump. It is not bottom-anchored because nothing yet says whether the room has enough
  history to fill the screen, and a short room ends up top-down anyway.

## Sheets and full-screen dialogs

- **Pickers of unbounded content have a fixed height.** The emoji picker and the reactor sheet are
  half the screen (`h-[50vh]`) whatever they hold: categories hold different counts (recents can hold
  one), and the reactor list changes live, so a height that followed the content moved the rows
  under the reader's thumb. Half a screen also leaves the message in view. The grid and the list scroll
  inside.
- **Their tab rows scroll sideways instead of shrinking.** Nine categories and recents are about 360px
  of 36px targets on a 343px sheet, and squeezing them would take the targets under the minimum; many
  distinct reactions would otherwise push the reactor list off screen.
- **The held emoji's name bubble is portalled to `body`.** A sheet's content is transformed (it slides
  and drags), and a `fixed` element inside a transformed ancestor is positioned against that ancestor,
  not the viewport. The bubble is measured after layout and hidden until placed, so it can be nudged
  inside the screen edges.
- **Full-screen dialogs zero their own safe-area padding inline.** The slide-up variant adds
  `pt-safe-top` / `pb-safe-bottom`; a dialog that draws its own glass top bar (the bar carries the inset
  itself, so the translucent header covers the status-bar band) or that ends in
  `KeyboardSafeAreaSpacer` (which already reserves the larger of the inset and the keyboard) would
  count the inset twice. The override is an inline `style`, not a `pt-0` / `pb-0` class, because those
  spacing keys are custom and `tailwind-merge` does not recognise them as padding, so both classes
  would survive and utility order would pick the winner. `MemberProfileDialog` zeroes the top,
  `JoinNickDialog` the bottom, `UpdateChannelDialog` both.
