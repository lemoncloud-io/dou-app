# ADR-0131: Dialogs return focus to whatever opened them, in ui-kit, for every app

> Status: Accepted · Decided: 2026-09-29 · Implemented: PR #508 (`fix/desktop-chat-critique`)
> · Scope: `libs/ui-kit/src/utils/openerFocus.tsx` · `libs/ui-kit/src/components/ui/dialog.tsx` ·
> `libs/ui-kit/src/components/ui/alert-dialog.tsx` · consumers: apps/desktop-web, apps/web,
> apps/admin-v2
> · The module doc is [`libs/ui-kit/README.md`](../../libs/ui-kit/README.md)

## Context

Radix returns focus to a dialog's `Trigger` when it closes. Most dialogs in the apps are opened from
state (a keyboard shortcut, a row's menu, a tile's click handler) and have no `Trigger`, so closing
them dropped focus on `<body>`. On desktop that included the image viewer, the Quick Switcher,
search, and every confirm. A keyboard user had to Tab from the top of the document after every one.
An alert dialog with only an action (a notice) also focused nothing on open, so Enter went to the page
behind it.

The fix could live in each app, or in each call site, or in ui-kit. Every consumer has the same
Radix gap.

## Decision

1. **ui-kit's `DialogContent` and `AlertDialogContent` record the element that had focus when they
   opened, and return focus to it on close** (`utils/openerFocus.tsx`). The record is taken by a
   hidden marker's layout effect, and focus already inside the content is not taken for the opener.
   That covers `autoFocus` and React StrictMode's double effects.
2. **They step aside in four cases:**
    - A caller that moved focus itself on close (focus is no longer on `<body>`) keeps it.
    - A caller that calls `preventDefault()` in `onCloseAutoFocus` keeps it.
    - An opener that has left the DOM is skipped.
    - **An opener that is a text field on a touch screen is skipped.** Focusing it raises the
      on-screen keyboard again, which on apps/web would follow every image attach or message-detail
      dialog.
3. **An alert dialog with no Cancel focuses its first control on open.**

## Alternatives

- **Pass a `Trigger` everywhere.** Most of these dialogs are opened from state, with no element that
  is the trigger in Radix's sense.
- **A `useReturnFocus()` hook each caller wires into `onCloseAutoFocus`.** Every new dialog would have
  to remember it, and the ones that did not were the bug.
- **Fix it in desktop only.** apps/web and admin-v2 have the same gap. The touch-screen exception
  exists because the change reaches apps/web.

## Consequences

- The change reaches apps/web and admin-v2. The touch-screen exception has been checked in tests,
  not on a device.
- A test in `apps/desktop-web/src/app/shared/components/dialogFocus.spec.tsx` holds the behaviour:
  focus return, caller-placed focus, StrictMode, the touch-screen text field, and the notice's focus
  on open. It lives in desktop-web because ui-kit has no test runner of its own.
