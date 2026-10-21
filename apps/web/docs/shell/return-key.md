# return key — one rule for every text field

The soft keyboard's return key behaves the same way on every screen, and no screen wires it up
itself. `useReturnKeyFlow` (`app/ui/hooks`) is mounted once in `AppRuntime`, next to the focus
auto-scroll, and decides both what the key reads and what pressing it does.

It applies only where typing happens on the soft keyboard (`typesOnSoftKeyboard` in `app/utils`, the
same device test the chat composer uses to decide whether Enter sends). A hardware keyboard — a
desktop browser, the iOS app on a Mac, an iPad on a trackpad — keeps the browser's own Enter, and a
form's Enter-to-submit with it.

## The rule

| The field                                      | The key reads                 | Return does                                                            |
| ---------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| a text input with another field after it       | `next`                        | moves the cursor to that field                                         |
| a single text input, or the last one in a form | `done`                        | closes the keyboard (the field loses focus)                            |
| a search box (`type="search"`)                 | the platform's own search key | runs the page's search handler if it has one, then closes the keyboard |
| a textarea                                     | untouched                     | a newline                                                              |
| the chat room and thread composers             | untouched                     | whatever the room decides (send or newline)                            |

"Done" closes the keyboard and does nothing else. It does **not** submit: a form is submitted by its
button. The two create dialogs once made the done key create the place or room, because the docked
CTA could sit behind the keyboard on a device that reports no keyboard height. Closing the keyboard
uncovers that CTA too, and it gives every single-field screen the same answer instead of one per
dialog. For the same reason the flow cancels a `<form>`'s implicit submit on the soft keyboard —
the room nickname dialog is one such form.

The search key is whatever the platform shows for a search box. On iOS that is the plain return
key unless the field sits in a `<form>`, and none of ours do.

## What counts as "the form"

A field's neighbours are the fields sharing its nearest `role="dialog"`, `role="alertdialog"` or
`<form>`; with none of those, the page. Sheets and dialogs portal out of the page, so without that
scope a sheet's only field would count the page's fields behind it and read `next`.

Within that scope a field is a stop only if it can take focus right now: not disabled, not
read-only, not inside an `inert` subtree, laid out (`display: none` is skipped) and visible
(`visibility: hidden` is skipped where the WebView has `checkVisibility`). A field folded away by
`max-height: 0` still counts. Moving to a field that cannot take focus would leave the keyboard up
with nothing focused. A textarea is a stop, so the input before it advances into it. A search box is
not: it stands alone.

Cells marked `data-return-key-unit` count as one stop. `VerificationCodeInput`'s six one-character
cells use it, so return on any cell finishes the code rather than stepping to the next cell.

The composer is recognised by `data-no-autoscroll`, the marker `MessageInput` already carries for
the focus auto-scroll. The in-place message editor is a textarea, so it keeps its newline.

## How it is wired

- The label is written when a field is pressed (`pointerdown`, before the tap focuses it, so the
  keyboard comes up with the right key) and when it gains focus (autofocus and the flow's own moves).
  It is not kept in sync by watching the DOM, because the keyboard does not redraw its key while a
  field keeps focus.
- **Return does what the key says.** The flow reads the label back on return instead of working the
  form out again: a field can be enabled after the label was set — the code field once "send code"
  is tapped, while the phone field keeps focus — and a key reading `done` that then moved the cursor
  would do something other than what it shows. Only `next` moves; anything else closes the keyboard.
- Return is handled on `document` in the bubble phase, after React's handlers. A screen that has to
  own return for one field can call `preventDefault()` and the flow steps aside. The search page
  relies on the order the other way round: its handler records the keyword first, then the flow
  closes the keyboard.
- A return marked as part of an IME composition is ignored — `isComposing`, or `keyCode` 229 where
  WebKit has already cleared it. The iOS Korean keyboard sends neither: it rewrites the syllable
  with a delete and an insert, and return arrives as a plain `Enter` (keyCode 13), so one press
  closes the keyboard there.
- On Android, Chromium can move focus for an IME `next` action by itself, without sending return to
  the page. It walks the focus order — `tabindex`, and any other focusable control, such as a
  `<select>` — and knows nothing of `data-return-key-unit`, so a field placed after a group of code
  cells would be reached cell by cell. No screen puts one there today.
