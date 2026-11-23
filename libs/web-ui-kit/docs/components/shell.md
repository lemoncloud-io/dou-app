# Shell: headers, navigation, layout, feedback

## Headers

- Glass headers (`ChatRoomHeader`, `ModalTopBar`) keep their own translucent fill (about 32% opaque, so content shows
  through) as the end state, and use `HeaderGlass` panes for the arrival. Keep at least the base 8px top padding plus
  the safe-area inset (`safeArea`). The content wrapper is marked `relative` so it paints above the panes.
- `HeaderGlass` fades the frost in by animating opacity, not blur radius, because WebKit interpolates
  `backdrop-filter` poorly and often snaps to the end value, which is the pop the fade removes. WebKit also sizes
  the backdrop layer on a later composite than the one that paints the box, so the safe-area strip stayed
  unfrosted for a beat. A fully opaque pane is painted first and fades out on the same clock, so the header is
  backed by frost, the opaque pane or a mix at every moment and never shows raw message text through its thin fill.
    - While `data-page-transition` is on `<html>` (set by `useNavigateWithTransition` in `@chatic/shared`; the
      attribute is the whole interface and the name must match there) the opaque pane holds and the fade starts when
      the transition ends. WebKit does not paint `backdrop-filter` inside view-transition snapshots, so a fade
      started during the slide would be invisible and the frost would appear in one frame afterwards. Android
      paints the frost inside snapshots, and the marker is not set there. The hold is capped at 1.5 seconds so a
      marker that is never cleared costs an opaque header for a moment, not for good.
    - Frame callbacks do not run while the document is hidden, so a timer settles the fade there; nothing is painted
      meanwhile, so skipping the fade costs nothing.
- `AppHeader`: `kind="no-cloud"` is the brand mark; `kind="cloud"` is cloud avatar plus name (and place nickname).
  `loading` (cloud kind only) draws a pulsing avatar and name, because a cold start would otherwise show blank
  text that reads as "this cloud has no name". `planLoading` holds the plan badge's slot with a pulse so the pill
  does not pop in and push search aside; it is ignored once `planTier` is set. `switcherMenu` makes the left cluster
  a dropdown trigger and Radix owns the open state. `switcherDot` is a presence dot for something behind the
  switcher (an unread cross-cloud push). `trailing` is off-design by default.
- `ChatRoomHeader`: `kind` only picks the fallback avatar glyph (`direct` and `self` share the single-person image;
  only `group` differs). `hideAvatar` is for a depth that is a view of a room, such as a thread, where the room's
  face would claim the screen is the channel. `loading` draws placeholders and holds `meta` back: otherwise the
  room opens on an invented "unnamed channel" label and snaps to the real name later, reading as the wrong room.
  The placeholder is sized to the title's line box so the header height, and the list's top inset, do not change.
  `onIdentityClick` makes avatar and title one button, and `meta` then renders inside it and `onMetaClick` is
  ignored (a button cannot hold a button); those zones use spans, since a button may hold only phrasing content.
  `moreMenu` takes precedence over `onMore`.
- `ModalTopBar`: 44px `leftSlot` and `rightSlot` keep the title centred; `rightSlot` replaces the close button.
- `RoomFilesHeader` and `FileSelectionHeader`: the title is laid over the bar so it stays centred although the sides
  differ in width; both selection buttons hold the same minimum width so the title stays centred whichever of
  "Select all" and "Deselect all" shows. The selection title is a polite live region, since picking a row changes
  nothing else a screen reader would announce.

## Navigation

- `FloatingTabBar`: a glass pill fixed to the bottom; the outer area lets touches through and only the pill takes
  them. `fixed` escapes the host's centred column, so it re-declares the cap with `--app-width` (430px fallback,
  this kit's design width). It keeps a 62px height with the 18px clearance the app's snackbar floor is built on.
    - Width: three tabs hug 72px slots; four do not fit that way on a 375px screen, so the bar takes the full width
      and unselected tabs share what the selected one leaves, down to 56px each. Fewer tabs stay centred rather than
      stretching.
    - Glass is the 8px frost with a saturation lift, a bright rim on the top-left and a fainter one opposite, and the
      design's shadow. Refraction is not reproduced: it needs an SVG displacement filter inside `backdrop-filter`,
      which Chromium paints and every iOS WebView ignores, so the bar would differ between phones. Dark mode keeps the
      treatment on a dark tint with dimmer rims.
    - Every tab carries its label as the accessible name, since unselected tabs show only an icon. A badge folds into
      the name as "{label}, {badgeLabel}" (an `aria-label` on the button would hide the badge text); `dot` is a count-less
      "something new" marker, ignored while `badge` is above zero. `badgeMax` defaults to 999.
    - The label folds with a `0fr` to `1fr` grid track (`width: auto` cannot animate), so the selected tab widens as
      the previous one narrows. Both glyphs stay mounted to cross-fade. The easing is written as an arbitrary property
      because an arbitrary `ease` utility is ambiguous between Tailwind's transition and tailwindcss-animate's
      animation and Tailwind only warns.
    - On a selected tab the badge moves to the capsule's corner, above the name, because the name starts 8px after the
      icon, under where an icon-corner badge would hang.
- `SegmentedTabs` is content, not navigation: no self-positioning, icons or badges. `variant="fill"` shares the row
  equally; `inline` hugs text with the underline as wide as the text. A `count` of 0 or undefined draws nothing.
  `RoomFilesTabs` is the same contract for the room file list; `dimmed` (selection mode) fades the row and stops
  tab switches, since a pick belongs to one tab's list and switching would leave it behind off screen.
    - Both implement the tablist keyboard contract: arrows move and wrap, Home and End jump, selection follows focus
      (cheap and reversible). Only the selected tab is a tab stop (roving tabindex) and focus is moved with it, or
      it would sit on an element Tab can no longer reach. The host gives each panel `role="tabpanel"`.
- `SelectionActionBar`: `placement="screen"` pins to the bottom in the bottom nav's place; `inline` lays out where the
  host puts it (a sheet's pinned footer, which already sits above the inset and would be covered by a fixed bar).
- `FileSelectionActionBar`: each action's own `disabled` expresses the states (all off, all on, delete only), set by
  the host from what is picked. It measures itself after every render, because the optional `notice` comes and goes
  with the selection, and publishes its height to the snackbar.

## Layout and gestures

- `ScreenLayout`: needs a height-constrained parent. It fills the device and centres once past `--app-width`
  (40rem fallback, the scaffold's own earlier cap, so a host that declares nothing is unaffected). A footer rides on
  a spacer of `max(--safe-bottom, --keyboard-height)`: the WebView does not shrink for the keyboard (the shell injects
  its height), so without it a footer CTA sat behind both. The bottom strip swallows `touchmove` so dragging on it
  does not rubber-band the page behind.
- `MenuCard` is `shrink-0` because it is often a flex child of a scrolling column, where default shrink would clip
  rows instead of letting the column scroll. `ListSection` is a titled list with no card surface.
- `PullToRefresh` is the scroll container itself, not a wrapper: the gesture needs `scrollTop` at the instant the
  finger lands, so a pull starts only from the very top. The ref and every div attribute (`onScroll` too) land on it
  so a host's scroll restoration keeps working. `contentClassName` is for a host whose container was a flex column.
    - Filling the gauge calls `onRefresh` at once, finger still down; waiting for release would make the full gauge a
      promise rather than the event. `onTick` fires per step on the way down (a ratchet: pulling back and down ticks
      again; several skipped steps tick once), `onFill` fires once per touch; the kit cannot make a haptic itself.
      `maxRefreshMs` is how long the indicator waits on `onRefresh` (the work is not cancelled), so a request stuck on
      a dead socket cannot hold the list down.
    - Touch listeners are native: React registers touch handlers as passive, and a passive `touchmove` cannot
      `preventDefault`, so the WebView would rubber-band the list under the indicator. Only a move that is or may
      become a pull is cancelled. The first move WebKit lets through starts its own bounce and every later move is
      uncancellable, so a downward-leaning move inside the slop is held back anyway.
    - Only `touchstart` is on the container. The rest of a touch is followed on the element the finger landed on:
      touch events keep targeting it even after it leaves the document, and a detached node bubbles to nobody, so a
      host swapping a skeleton row for the real list mid-drag would otherwise never hear the release.
    - The slop (`TOUCH_DIRECTION_SLOP`, shared with `SwipeActionRow`) must be the same distance for both: the pull claims
      a touch leaning down and the swipe one leaning sideways, and at one distance they can never both pass. iOS reports
      one-pixel moves, often `dy === 0` or a sideways twitch on what is plainly a pull. Finger travel is halved for the
      elastic feel; upward travel is no pull; a second finger stops the gauge where it is. A step re-arms only after the
      pull falls back clear of its boundary, so a finger resting on one does not buzz.

## Feedback

- `EmptyState` leads a section from its left edge; `IconEmptyState` stands for a whole screen with nothing in it.
  The action pill renders only when `actionLabel` is paired with `onAction`.
- `PromoBanner`: the link and the dismiss are opt-in so one component covers the relay home (both) and the cloud
  switcher sheet (dismiss only). `\n` in the copy is honoured.
