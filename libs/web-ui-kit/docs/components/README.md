# Component notes

What the components do and which props need more than their name and type to use correctly. One topic file per
area; each entry says what the component is for and lists only the notes the code cannot say for itself.

| Topic                                         | Covers                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| [foundations](./foundations.md)               | Buttons, inputs, avatars, badges, chips, bubbles, audio bars, brand, icons     |
| [chat](./chat.md)                             | Attach panel, message bubbles' content (audio, file, media), receipts, threads |
| [media](./media.md)                           | Photo picker, photo editor, strips, audio detail, room media grid              |
| [overlay](./overlay.md)                       | Bottom sheet, dialogs, viewers, slide and drag helpers                         |
| [shell](./shell.md)                           | Headers, bottom navigation, tabs, screen layout, pull to refresh, empty states |
| [lists-and-sections](./lists-and-sections.md) | Rows, swipe actions, section headers, collapsible sections                     |
| [subscription](./subscription.md)             | Plan cards, status banner, key/value tables                                    |

## Rules every component follows

- Stateless. The host owns open, selected and loading state; a component holds only the state of one gesture
  (a drag offset, a pull distance) or of one motion (a leaving tile). The host decides what the gesture means.
- No copy. Every label and accessible name is a prop with an English default, so the host passes localized text.
- "Omit the handler to hide the control" is the common rule: a button or row renders only when its handler is
  passed, so the host's permissions decide what appears.
- Safe areas and the keyboard arrive as CSS variables injected by the native shell: `--safe-bottom`,
  `--keyboard-height`. In a browser they are absent and every term falls back to `0px`. Layouts use
  `max(--safe-bottom, --keyboard-height)`, never a sum, because the keyboard already covers the bottom inset.
- `--app-width` is the host's column cap. Fixed-position pieces (`FloatingTabBar`) and `ScreenLayout` re-declare
  the cap themselves so they stop where every other surface stops; each has its own fallback for a host that
  sets nothing.
- The app's bottom snackbar rests above whatever pins to the bottom. Pinned pieces (`FloatingButton`,
  `FileSelectionActionBar`, `PhotoGridSheet`, `AttachPanel`, the viewers' action bars) publish their height
  through `useToastLift` while mounted, so a toast a press raises does not land on the button just pressed.
- Reduced motion: slides, fades and the strips' open and close are instant under `prefers-reduced-motion`.
- Colours come from tokens. `--warning` is declared by `apps/web` but not by this kit's token sheet, so the
  warning tones carry an inline fallback to keep Storybook correct.
- Full-screen and dialog pieces are built on `@radix-ui/react-dialog` or the raw Radix alert dialog directly, not
  on `libs/ui-kit`'s styled wrappers: those add a centred card, padding or classes that the kit would spend its
  whole className undoing, and the styled `Cancel` / `Action` inject classes through a `Slot` that concatenates
  rather than merges them, which breaks the two-up button row.
