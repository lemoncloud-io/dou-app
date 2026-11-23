# Lists and sections

## Rows

- `ListRow`: one component for room-settings and menu rows; it is a button only when `onClick` is set, and extra
  props pass through to the root. `subtitleIcon` is a small glyph leading the subtitle in its own colour, for what
  the line is when it is not what it usually is (a pencil for an unsent draft instead of the last message). A glyph,
  not a coloured word, keeps the row's only colour for what needs attention (the unread badge) and leaves the line's
  width to the text. It shows even without a subtitle.
- `ManageChannelItem`: the selection area and the pin are separate controls, so tapping the pin never changes the
  selection. `selectable={false}` drops the checkbox and shifts the content into its place; it is used for the self
  chat, which can be neither deleted nor left. The whole selection area is the checkbox control and the inner
  `Checkbox` is a visual indicator.
- `SelectableUserItem` and `SelectedAvatarRow`: the whole row is the single accessible checkbox. The selected row keeps
  an exiting avatar mounted just long enough to play its exit; the duration constant must match the CSS
  `duration-*` class, and pending timers are cleared on unmount.
- `NotificationRow` and `RoomFileRow` hold one gesture: a held press fires `onLongPress` after 500ms
  (`NOTIFICATION_LONG_PRESS_MS`, `ROOM_FILE_LONG_PRESS_MS`) and the click that ends it is swallowed, including when the
  host has switched the row into selection mode meanwhile, so the same press does not pick and unpick. A finger
  resting on the position bar is aiming a seek, not asking for selection mode. In selection mode the whole row is one
  checkbox.
- `RoomFileRow` serves audio, files and links; only the leading slot differs.
- `MonthGroupHeader` is a heading so a screen-reader user can jump month to month; `sticky` needs its own ground so
  rows sliding under it do not show through.

## Swipe actions

- `SwipeActionRow` uses the same touch model as `PullToRefresh` for the same reasons (native listeners, the touch
  followed on the element it landed on, a shared slop; see [shell](./shell.md)). A mostly vertical touch is a scroll
  and is left alone for its whole life; a pull-to-refresh above abandons a sideways one, so the two never both claim
  a touch.
- Which side is open is the host's (`open`, `onOpenChange`), so it can keep one row open at a time. Three touches
  close an open row without running anything: a tap on the content (not passed on), a scroll that starts on it, and a
  touch elsewhere. The click that last touch would become is swallowed too, so a tap meant to put the row away does
  not also press whatever it landed on.
- `onReveal` fires once per crossing of the point where letting go would open a side, never on the way back (a haptic
  hook). Past its full width a side follows the finger at a fraction, so it reads as elastic. Trailing actions are
  ordered from the content's edge so the last sits at the screen edge, where a destructive action belongs.
  Action `tone`: `accent` for a change to the row's own standing (pin), `neutral` for a reversible setting,
  `destructive` for a way out (leave, delete). An action's `onSelect` runs after the row has asked to close, so a
  dialog it opens appears over a closed row.

## Sections

- `SectionHeader`: `count` renders in the title's own colour (the accent green it once used is gone). Clicks inside
  `actions` are not forwarded to the header's `onClick`.
- `CollapsibleSection`: the whole header row toggles, not just the chevron, which is a small phone target.
  `description` and `footer` sit outside the collapsing region and stay visible when collapsed (the cloud switcher
  relies on this). Expanding mounts the body at once; collapsing keeps it mounted through the height transition and
  then unmounts it, so nested rows unregister their sync while hidden. The unmount waits for this wrapper's own
  height transition and ignores ones bubbling up from child rows. Height animates through a `0fr` to `1fr` grid row.
  The section is `shrink-0` since it is a flex item in scrolling columns whose `overflow-hidden` body invites
  engines to disagree on min-size; a list section never shrinks, so a long list overflows the scroller instead of
  being clipped. It works controlled (`open`) or uncontrolled (`defaultOpen`, default open).
- `GroupLabel` is the small muted label above a settings list; `SectionHeader` is the larger bold list title.
- `InfoField`: a read-only label and value that looks like a form field. A missing value means the caller leaves the
  field out, never a dash, so the screen does not state a fact the server did not send.
- `RoomFilesSummary`: `loading` draws placeholder bars for the counts, because `0` would say the room has none.
  `accent` draws a cell navy with a white glyph (the design marks the audio cell this way); which cell is the host's call.
