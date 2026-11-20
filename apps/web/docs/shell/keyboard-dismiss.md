# keyboard dismiss — a tap on empty space closes the keyboard

A tap that lands on empty space takes the soft keyboard down, on every screen, and no screen wires
it up itself. `useDismissKeyboardOnTap` (`app/ui/hooks`) is mounted once in `AppRuntime`, next to
the return-key flow ([return-key.md](./return-key.md)), and blurs the focused field when such a tap
arrives. Blurring is what closes the keyboard on both platforms; nothing else about the tap changes.

The two WebViews disagree on their own. iOS WebKit keeps the keyboard up for a tap on anything that
cannot take focus. Android's WebView usually moves focus off the field for such a tap by itself, but
that is the engine's behaviour, not a promise, and it differs by WebView version. One
rule at the root gives every form the same answer on both, and on Android it simply arrives first.

## The rule

| The tap lands on                                                       | The keyboard |
| ---------------------------------------------------------------------- | ------------ |
| empty space — text, a card, a header's title, a dialog panel's padding | closes       |
| another field                                                          | stays        |
| a button, a link, a label, a switch, a tab, a menu item                | stays        |
| a verification code's cells, or the gaps between them                  | stays        |
| anything while the chat or thread composer has focus                   | stays        |

"Interactive" is a selector, not a judgement made per screen: form controls, `a[href]`, `label`,
`summary`, `contenteditable`, the ARIA roles a control carries (`button`, `link`, `checkbox`, `radio`,
`switch`, `tab`, `menuitem`, `option`, `slider`, `combobox`, `textbox`), any `tabindex` other than
`-1`, and `data-return-key-unit`. A button keeps the keyboard so the press does what it says — "send
code" beside the phone field must not first drop the keyboard and shift the button out from under the
finger. `tabindex="-1"` is left out on purpose: a Radix dialog's panel carries it, and a tap on the
panel's empty space is the tap this is for.

The chat and thread composers (marked `data-no-autoscroll`, the marker the focus auto-scroll and the
return-key flow already read) are left alone. The room decides when its keyboard and its attach panel
trade places ([layout-shell.md](./layout-shell.md#the-attach-panel-takes-the-keyboards-place)), and a
blur from outside would race that handover.

It applies only where typing happens on the soft keyboard (`typesOnSoftKeyboard`). A desktop browser,
the iOS app on a Mac, or an iPad on a trackpad keeps the browser's own focus rules.

## Only a tap

A press counts as a tap when it lifts within 10px of where it went down (`TAP_SLOP_PX`) and the
browser did not cancel it. Scrolling a long form starts as a press on empty space too, and moves; the
browser also sends `pointercancel` once it takes the gesture over as a scroll. Either way the keyboard
stays, so a person can scroll to the next field while typing. A second finger cancels the tap.

## How it is wired

- Built from `pointerdown` / `pointerup` / `pointercancel`, not `click`. WebKit on iOS sends no `click`
  for a tap on an element with no click handler of its own, and the empty space this is for has none.
- The listeners are on `document` in the capture phase, so the blur comes before the target's own
  handlers. A handler that focuses a field on purpose (a row that opens its field) therefore still
  gets the last word and puts the focus back, though the keyboard may visibly drop and rise again on
  iOS.
- The focused element is read at the moment the finger lifts: a text input (not a checkbox, file or
  other non-text type), a textarea, or a `contenteditable` element. With anything else focused there is
  no keyboard to close.

## Verification

- `apps/web`: `ui/hooks/useDismissKeyboardOnTap.test.tsx` — a tap on text and on a dialog panel blurs;
  a button, another field, the focused field, a code group, a moved press, a cancelled press, a second
  finger, the composer and a desktop user agent keep focus.
- On a device: focus a field on the profile edit screen, tap the screen title — the keyboard closes;
  focus it again and tap the save button area's empty strip — it closes; tap the button itself with a
  valid value — the save runs.
