# Overlay

Sheets, dialogs, full-screen viewers and the helpers they share.

## Bottom sheet

- `BottomSheet`: built on the shared Radix sheet (`side="bottom"`) and honours the bottom safe-area inset. The title
  is always rendered, visually hidden when empty, for accessibility.
    - `hideHeader` drops the title bar for sheets whose content names itself (a row of emoji); `title` and
      `description` are still required and become the accessible name.
    - `description` omitted opts out of Radix's missing-description warning deliberately (the key is passed with no
      value only when there is nothing to link; spreading it unconditionally would also suppress the auto-link).
    - `disableDragToDismiss` is for a sheet that has to be answered rather than waved away. The gesture is on by
      default because the panel already looks draggable.
    - `scrollRef` is for content that scrolls in its own container: the body then never scrolls, its `scrollTop`
      would always read "top", and swipe-to-dismiss would arm mid-list. With it set the drag arms only when that
      element is at its top; the content root should fill the body (`h-full`).
    - Keyboard: focusing a field lifts the panel above the soft keyboard (`--keyboard-height`, injected by the native
      WebView; absent in a browser) and shrinks max height by the same amount. The drag offset and the keyboard lift
      share one `transform` because two `transform` declarations do not compose. The home-indicator inset is dropped
      while the keyboard is up, since the keyboard covers it.
    - Dismissal finishes by calling `onOpenChange`; the sheet closes nothing itself.
    - Drag phases: `idle` hands the panel to Radix's keyframes; `dragging`, `settling`, `resting` and `dismissing` are
      the component's own. `resting` exists because switching an `animation: none` back off restarts the animation,
      and the keyframe still attached to an open panel is the enter one, so handing the panel back replayed the
      slide-in after every touch. A dismissing release slides the panel out itself and only then calls back, since
      Radix's exit keyframe animates from the resting place and would snap the panel back up first. `!animate-none`
      is required: the keyframes come from `data-[state=...]:` variants that Tailwind emits after plain utilities.
    - A drag that starts during a spring-back takes the panel from there. Capture happens only once a press clears
      the slop (capturing on the first move would swallow taps on buttons inside). A second finger and a
      secondary-button press are ignored. `overscroll-contain` on the body keeps a scroll from leaving the sheet.
- `sheetDrag.ts`: dismiss at a quarter of the panel's height (a share, not pixels, because sheets range from a row
  of emoji to a near-full form) or at a flick of 0.5 px/ms, either one, never both. The slop is 8px, the platform
  touch slop; arming on the first pixel captured the pointer and a slightly unsteady tap on an emoji did nothing.
  Upward drags are dropped, not resisted. A drag arms only with the scroller at `scrollTop === 0`; velocity is
  taken from the last two samples so a long slow drag ending in a flick still reads as a flick.
- `SheetAction` is a plain button row that performs something and closes; `SheetOption` is a single-select radio
  row. They look alike and behave nothing alike. No divider between action rows: a rule reads as a group boundary.
- `RoomFileMoreSheet` and `AudioDetailMoreSheet`: a row exists only when its handler is passed, so the host's
  permissions decide the list. A row closes the sheet after it runs so whatever it opens next is not stacked under
  a sheet still standing.

## Dialogs

- `AlertDialog`: with no cancel label it is a single full-width confirm. Copy uses `white-space: pre-line`, so `\n`
  in a translation is a deliberate break. It uses the raw Radix `Cancel` and `Action`, not `libs/ui-kit`'s
  wrappers (see the shared rules in the [component notes index](../../../../components/mobile/docs/components/README.md#rules-every-component-follows)).
- `UnsendableFilesDialog`: when `restCount` is 0 the two buttons become one OK. `reason` honours `\n`. A long
  batch scrolls inside the dialog rather than pushing the buttons off screen. It is not built on `AlertDialog`
  because the file list sits between the copy and the filled-pill buttons.

## Viewers

- `MediaViewer`: a message's photos and videos full screen. The host owns `index` (`null` closes), which is also
  how a refreshed signed address reaches an item that is already open.
    - Pages: `ready` photo draws `src` over the small `preview` until the original loads; a video plays `src` with
      `preview` as poster; `sending` photo is drawn as ready, a sending video shows only its preview; `broken` is a
      placeholder so the count still matches. Only the showing page and its neighbours are drawn, so ten originals
      are not loaded at once. Only the showing video is a `<video>`: a neighbour draws its poster, because
      prefetching a video is a download the user may never watch.
    - Paging stops at the ends instead of wrapping: a count jumping from last to "1" reads as a different message.
    - Closing: a downward drag pulls the viewer after the finger and fades the backdrop; past a sixth of the height
      (or a flick) it carries on down. The close slides on from where the finger let go, so the photo never jumps back
      first; a host that does not close leaves it pulled down. A zoomed photo pans instead, and a drag on a video's
      own controls (the bottom `72px`) is left to them.
    - Zoom: pinch scales around the point between the fingers (to 4×), double tap zooms to a point or back out, a
      one-finger drag pans while zoomed and a tap beside the photo does not close. The browser's pinch cannot be used
      because the app fixes the page scale and it would zoom the whole screen. Paging or closing resets the zoom,
      except that a zoomed photo slides away as it was.
    - Video: browser controls, fitted between the top and bottom bars; no zoom. `autoPlay` starts only the item the
      viewer opened on, so the browser still counts the start as the user's tap; if refused, a big play button asks
      for a tap. Leaving a video pauses, rewinds and removes its address so the download stops. The address is set in
      the video component so a refreshed address and React's double-mounted effect in development both release and
      re-set it in one place.
    - `renderFooter` builds a bottom action bar from `MediaViewerActionButton` (busy buttons stay focusable and only
      ignore presses, so keyboard and screen-reader focus is not dropped from the button just pressed). While the bar
      shows, the viewer lifts the snackbar by `MEDIA_VIEWER_FOOTER_TOAST_LIFT`.
    - The press-outside guards: a toast with its own button is drawn on top of the viewer, so pressing it must not
      close the viewer. A press that turned into a swipe, pan, pinch or double tap is followed by a click on the
      backdrop that must not read as "tap outside to close".
- `DocumentViewer`: a PDF in the same black frame, pages in one scrolling column (left-right paging does not suit a
  document). The host owns the renderer (pdf.js in the app), so the kit never loads one; `pages.renderPage` draws page
  `n` into a canvas and only one drawing targets a canvas at a time. Only pages near the view hold a canvas; the rest
  keep their size, so drawing never moves neighbours and a long file does not hold every page in memory. Pinch
  zoom (to 4×) applies a CSS scale while the fingers move and redraws at the new width on release, then moves the
  scroll so the content under the fingers stays put; a double tap goes to 2× or back to fit. `renderFooter` shows in
  every status so a file that will not open can still be saved. A page that fails stays a blank sheet. Focus lands
  on close, not the first control, so a ring on share or save does not look pressed.
- `imageZoom.ts` and `documentZoom.ts`: a zoom is `translate(x, y) scale(s)` about the page centre; an image point
  `u` lands at `t + s · u`, and holding a screen point still while the scale changes is what anchors a pinch under
  the fingers. A pinch ending below 1.05 snaps to fit. Scroll after a document zoom is `(scroll + focal) × to/from`,
  never negative.

## Shared motion helpers

- `slidePresence.ts` (`SLIDE_MS` 300, `slideEase`, `prefersReducedMotion`): the slide used by `AttachPanel`, the photo
  grid footer and the strips. The timing is exported for a host moving a panel itself. The curve is
  `cubic-bezier(0.32, 0.72, 0, 1)` as a function (found by bisection) for motion CSS cannot carry: a scroll
  moved alongside a growing width, or a host's frame loop. Reduced motion is checked per change, not left to
  `motion-reduce:transition-none`, because with no transition there is no `transitionend` either and exits would
  wait for the fallback. The fallback is `SLIDE_MS + 100`, for a hidden tab that runs no transitions. Opening
  mounts out of place, forces a layout read to commit that position, then moves it in the next commit so the move is
  a transition.
- `viewerShell.ts`: shared by `MediaViewer` and `PhotoEditor`, so a swipe that turns one's page turns the other's.
  The duration is set twice on purpose: `duration-300` times the settle but loses to the 150ms that
  `data-[state=...]:animate-in/out` carry, so matching `data-[state=...]:` copies win. Easing is written as a
  property because an arbitrary `ease` value is claimed by both Tailwind and tailwindcss-animate and a class that
  matches two utilities emits no rule. React events bubble through portals, so a sheet the host opens from a
  button counts as inside the screen for React; `viewerShell` checks the DOM so a drag or arrow key on that sheet
  does not turn the page behind it. A page turns past 1/5 of the width or a flick; past either end the strip gives
  only a little.
