# scroll, menus and back — shared hooks that every screen leans on

Four small hooks in `app/hooks/` that screens use without owning. Each exists because the obvious
approach fails in a specific way.

## Scroll position — `useScrollRestoration`

Leaving a list (or a chat room) and coming back lands where the reader left it, not at the top (or, for a
bottom-anchored list, the newest item).

- **A module-level map, not component state.** A route change unmounts the page, which plain state cannot
  survive. It is not persisted: a full reload starts at the top.
- **`key` scopes the memory**: a fixed string for a singleton screen (the home list), a per-subject id for a
  screen that remounts per subject (a channel id). A `null`/`undefined` key disables the hook, for a subject
  not yet resolved.
- **`ready` gates the restore.** Applying an offset to an empty or short list clamps it to 0 and silently
  loses it, so the restore waits until the container has content to scroll through.
- **The offset is written on every scroll, not on unmount**, because React detaches host refs before a
  parent's layout-effect cleanup runs, so the container is already `null` by then. For the same reason the
  cleanup never re-reads `containerRef`.
- **Claiming is take-and-clear.** A mount claims the saved offset once; `hasPendingRestore` can then tell
  "claimed, waiting for `ready`" from "nothing saved". A claim that was never applied (unmounted before
  `ready`) is put back untouched, but only if nothing newer was recorded: a list too short to scroll when
  `ready` turned true, then lengthened, may have been scrolled meanwhile, and writing the stale claim over
  that would send the next visit to a place the reader had left.
- **`manualConsume`** is for a caller with its own competing scroll behaviour, such as an auto-scroll-to-
  bottom pin. Layout effects run before passive ones, so clearing the flag inside this hook's layout effect
  would let the pin's passive effect see "nothing pending" in the same commit and undo the restore a frame
  later. With `manualConsume`, the flag stays until the caller calls `consumePendingRestore` in its own
  commit. Plain lists omit it.

## Header chrome that follows the scroll — `useScrollChrome`

Lets a screen restyle its header as the list under it scrolls: one state once content passes under the
header (`scrolled`), another once a sticky row has pinned below it (`pinned`). It re-renders only when one of
the two flags flips. Put the anchor on a zero-height element right before the sticky row, because the
sticky row itself cannot be measured once it is stuck.

- `pinned` is true when the anchor's distance below the scroll area's top has reached the row's own sticky
  `top` (`pinAt`, which is negative when the row tucks part of itself under the header), and **also requires
  `scrollTop > 0`**: an anchor that starts at the very top sits at offset 0 before anything has moved, and an
  unscrolled list has nothing passing under the row. No anchor on screen means never pinned.
- The distance is measured against the container's box, not with `offsetTop`: the pull-to-refresh wrapper
  moves content with a transform, which `offsetTop` does not see.
- It is driven by the scroll event alone. A programmatic offset (a restore) fires one too, so returning to a
  list part-way down lands with the right chrome.

## Letting a menu leave before the screen changes — `useMenuNavigate`

A dropdown item that navigates starts two animations with no agreed order. Radix closes the menu on select
and its exit takes about 150 ms, while the page transition (View Transitions) snapshots the outgoing document
in the same tick, still with the menu in it, so the menu is painted into the old page and slides away with it.
`menuDismissal.ts` sequences them: the menu goes, then the screen changes. `useMenuNavigate` is `navigate`
with that wait in front; use it from a `DropdownMenuItem` that changes screens, and plain
`useNavigateWithTransition` anywhere else.

- **It waits for the menu to leave the DOM, not for `animationend`.** When an item's `onClick` runs Radix has
  not closed anything yet, so a listener attached then would wait on an animation not yet declared and could
  catch the tail of the enter animation. Unmounting means the same thing however the menu was closed, and
  Radix unmounts only after its exit has played.
- **There is a ceiling, `MENU_EXIT_TIMEOUT_MS` = 260 ms.** The unmount never comes for a menu kept mounted,
  under `prefers-reduced-motion` (the keyframe resolves to nothing), or if Radix changes how Presence
  unmounts, and a tap that silently does nothing is worse than a transition that is slightly imperfect. It is
  above Radix's exit, and would not be noticed if it were ever spent. It is armed before the observer so a
  menu that never unmounts cannot strand the navigation.
- It resolves immediately when no menu is open, so it is safe in front of any navigation.

## Back inside the WebView — `useBackHandler`

It tells the frame, where it has a back gesture (the host's `appShell` port), whether a back press is the
page's to spend, and handles the native back event. The judgement (what is behind the current entry) belongs
to the navigation module; this hook supplies the overlay half.

- **Report the whole answer, history included**, not only "is a dialog open". Letting the Android shell add
  the WebView's own `canGoBack` offered exit from pushed screens (it does not follow the router's `pushState`
  entries) and dropped presses on the first screen after a sign-in's `-2` rewind, where it read true.
- It reports on every location change and whenever a dialog opens or closes (a `MutationObserver` on
  `data-state`). After a navigation it reports at once rather than waiting for the location effect: a rewind
  lands a frame or more later, and `canGoBackInApp` already counts the rewind in flight, so a quick second
  press is answered from where the first is going (on the first screen, the frame gets it, not the page).
- **Overlays must be Radix primitives**, found by their open `data-state` and a dialog, alert dialog, menu or
  listbox role. This stays in the hook because which library draws an overlay, and how it is asked to close,
  is the UI layer's business, not the history module's. A dialog opts out with `data-prevent-back-close`; the
  press is still spent on it, it just declines to act. `AlertDialog` does not close on Escape by design (it
  wants an explicit choice), so the press goes to its first button; everything else gets an Escape on the
  document, where Radix listens.
- The outcome is returned, not dropped: "nothing open, nothing behind" is the case the shell needs in order to
  decide about exiting.
