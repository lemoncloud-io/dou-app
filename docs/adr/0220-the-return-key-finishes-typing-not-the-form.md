# ADR-0220: The return key finishes typing, not the form

> Status: Accepted · Decided: 2026-10-21 · Implemented: `fix/web-form-return-key`
> · Scope: `apps/web/src/app/ui/hooks/useReturnKeyFlow.ts` · `apps/web/src/app/runtime/AppRuntime.tsx`
> · The module doc is [apps/web shell/return-key](../../apps/web/docs/shell/return-key.md)

## Context

The soft keyboard's return key did something different on almost every screen of `apps/web`:

- Three forms (set password, contact invite, add friend) moved the cursor down with a per-form hook
  and closed the keyboard on the last field.
- Four screens (profile, cloud and place edit, the sign-up and reset email) closed the keyboard
  with their own copy of the same handler.
- The two create dialogs (place and group room) **created** on return, because their docked submit
  button could sit behind the keyboard on a device that reports no keyboard height.
- The room nickname dialog submitted through its `<form>`.
- Everything else — the phone and email verification fields, the feedback title, the place profile
  name, the search box — did nothing at all, and the keyboard stayed up until the reader tapped
  somewhere else. The feedback title even labelled its key "next" with nothing behind it.

A reader could not predict what the key would do, and every new screen was one more place to forget
to wire it.

## Decision

One rule, mounted once at the app root and applied to every text field on the soft keyboard:

1. **A text input with another field after it reads "next", and return moves the cursor there.**
2. **A single input, or the last one, reads "done", and return closes the keyboard.** It does not
   submit; a form is submitted by its button. The flow also cancels a `<form>`'s implicit submit.
3. **A search box keeps the platform's search key**; return runs the page's search handler, if it has
   one, and then closes the keyboard.
4. **Textareas keep return as a newline, and the chat room and thread composers are left alone.**
5. **Return does what the key shows.** The label is read back on return rather than recomputed, so
   a field enabled after the label was set cannot turn a "done" key into a move.
6. **Hardware keyboards are out of scope.** A desktop browser, the iOS app on a Mac and an iPad on a
   trackpad keep the browser's own Enter, including Enter-to-submit. The device test is the one the
   chat composer already uses to decide whether Enter sends.

## Consequences

- The create dialogs no longer create on return. Closing the keyboard uncovers the docked button,
  which answers the reason they submitted in the first place, and the dialogs now behave like every
  other single-field screen. On a soft keyboard the room nickname dialog no longer saves on return
  either.
- A screen opts out of the rule for one field by calling `preventDefault()` on return; a group of
  inputs that reads as one field (the verification code cells) is marked `data-return-key-unit`.
  Nothing else needs wiring, and the per-form hook and the per-screen handlers are gone.
- On Android, Chromium may move focus for a "next" action itself, in focus order, without the page
  seeing return. It lands on the same field this rule picks for every form the app has today.

## Alternatives considered

- **Keep return-to-submit on the create dialogs.** Rejected: it made "done" mean two different
  things depending on the screen, and the hidden-button problem it worked around is solved by
  closing the keyboard.
- **Apply the rule to hardware keyboards too.** Rejected: Enter-to-submit is what a hardware keyboard
  user expects, and dropping focus after a search would make refining a query need a click.
- **Wire each form by hand with the per-form hook.** Rejected: that is the state this replaces, where
  the screens nobody remembered did nothing.
