# Component notes

What the desktop pieces are for and which props need more than their name and type to use correctly. How
the chat uses the keyboard hooks is in `apps/desktop-web` [keyboard](../../../../../../apps/desktop-web/docs/chat/keyboard.md).

## Components

- `Skeleton`: a pulse block, hidden from assistive tech, still under `prefers-reduced-motion`. Size it with
  `className` or `style`; screen skeletons are composed in the app because they carry its loading copy.
- `FormField` and `FormError`: a label over exactly one control. With `invalid`, the control gets
  `aria-invalid` and, when `errorId` is passed, the error's id appended to its own `aria-describedby`.
  `FormError` is the `role="alert"` paragraph that id points at.
- `Hint`: a tooltip around one focusable child. It opens on keyboard focus but not on the focus a closing
  dialog hands back (`relatedTarget` is empty), so a dialog does not reopen a tooltip on close.
- `RailTile`: a square rail button with a caption under it. `active` sets `aria-current="page"`; `dot` draws
  the unread dot. `accessibleName` replaces the caption for screen readers when the caption is shortened.
- `ScrollHint`: a fade with a chevron at the top or bottom of a scrolling rail. Pair it with
  `useScrollOverflow`, which says which edge has more content.
- `SettingsRowGroup`, `SettingsNavRow`, `SettingsSwitchRow`, `SettingsActionRow`: the bordered group and
  its three row kinds. The switch row's label is a `<label>` for the switch, and its hint describes it
  unless `describedBy` names another node.
- `PANE_HEADER`, `PANE_TITLE`, `PANEL_TITLE`: the class strings of a pane's header bar and title, so a
  list pane and a trailing panel line up.

## Hooks

- `useEscapeClose(close)`: closes on Escape unless the key was already handled (`defaultPrevented`) or a
  Radix dialog, menu, listbox or popover is open above it. Omit `close` to turn it off.
- `useRovingFocus(rootRef)`: makes a list one tab stop. Rows are `data-roving-item`, author blocks
  `data-roving-group`, and a row's toolbar `data-row-actions`; controls outside the current row are
  parked at `tabIndex=-1`.
- `useListboxNav(count, onPick, resetKey)`: ↑/↓ move, Enter picks, an IME composition is ignored, and the
  active index resets when `resetKey` changes.
- `useMediaQuery(query)` and `useReducedMotion()`: a live `matchMedia` result.
- `useScrollOverflow()`: a `ref` plus `above` and `below`, re-measured on scroll, resize and child changes.
- `useViewportNarrow(max)`: true below `max` pixels of window width; `NARROW_SHELL_WIDTH` (860) turns the
  sidebar into a drawer and `COMPACT_SHELL_WIDTH` (480) is the next step down.
- `useCopyToClipboard(resetMs)`: `[copied, copy]`; `copied` stays true for `resetMs` after a successful write.
