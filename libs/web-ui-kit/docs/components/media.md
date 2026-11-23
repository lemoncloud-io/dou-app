# Media

The in-app photo picker, the photo editor, audio detail and the room file list's media pieces.

## Photo picker

- `PhotoGridSheet`: a tall sheet whose title is the album name and opens the album list. The title row and picked
  strip stay put; only the grid (with `notice` above it) scrolls, in its own container, and the sheet is told which
  so swipe-to-dismiss still arms only at its top. The host owns what is picked, the album, what has loaded, the
  column count and whether the pick goes as one message; the component never reads the library.
    - The grid is virtual: it is laid out at full height from `count` and renders only the rows on screen plus a few
      either side. `onVisibleRangeChange` reports the range and the pixel size to ask previews at; the host loads
      what the range needs. `photoAt(i)` returns `undefined` while an index has not loaded and a pulsing skeleton
      stands in. With `loading` and nothing laid out yet, skeleton tiles fill the screen.
    - `columns` is 2 to 5, default 3. With `onColumnsChange` a pinch steps the columns and keeps the photo under the
      fingers where it was; without it columns are fixed. The pinch listener is non-passive only while a pinch is on,
      since a non-passive `touchmove` makes every scroll wait for the main thread. iOS WebKit's own gesture events
      are cancelled too, in case a WebView ignores the viewport's no-zoom.
    - `max` locks unpicked tiles once reached. `onCamera` omitted hides the camera tile.
    - `sending` is for a pick the host is still reading (a video copied out of iCloud can take minutes): the send
      button greys but keeps its label and takes no second tap, and the sheet stays so the screen is never empty.
    - The footer (send button, plus an Edit button and a "one message" checkbox when provided) lies over the grid's
      bottom edge instead of taking room from it, so photos stay put while it slides over them; the grid keeps its
      last row reachable with a spacer of the height the footer reports. Both rows are inert while `sending`.
      The checkbox shows only from two picked items, since one item is one message either way. `onEdit` is called
      with no id from the footer and with an id from a strip tap.
    - A long grid gets a fast-scroll handle (`GridScrubber`) only past three screens of content. It is pointer-only
      and hidden from assistive tech, and its presses never reach the sheet, so a drag down it is a scroll, not a
      dismissal. `insetBottom` is how much of the scroller's bottom the footer covers, so the handle is never dragged
      under it.
    - Tiles are keyed by position and photo: a sharper preview after a pinch keeps the element, a different photo at
      that position gets a fresh one with its own skeleton.
- `PreviewImage` cross-fades a skeleton out over 300ms while the image fades in, because a base64 preview takes a
  moment to decode and would otherwise pop in. The skeleton is for the first load of an element only; a sharper copy
  of the same photo keeps the current one until the new one is in. An image already decoded shows at once. A
  preview that fails to decode stops pulsing. An empty `src` draws nothing. The parent must be `relative` and clip
  its corners.
- `RecentPhotoStrip`: with `onToggle` it picks in place like the grid (lime badge with pick order, locks at `max`);
  without it a tap hands the photo to the host to open the grid with it picked. With `loading` it draws skeleton
  tiles (`placeholderCount`, default 6) under the real title so the panel has its final layout from the first
  frame, and "See all" waits for the first photo. With nothing to draw it draws nothing, and moves between the two
  on the slide's timing, still drawing what it last showed while it closes.
- `SelectedPhotoStrip`: removing here is the same as un-picking in the grid. `size="compact"` is the row above a
  chat composer; it brings its own glass surface because a composer has none and thumbnails would run into a
  message passing underneath. With `onSelect` a thumbnail is its own button (the editor opens on it) and the remove
  chip stays a separate button beside it. An edited photo draws cropped to the square with a pencil mark, so a crop
  that looks natural is still told from the original. The host keeps it mounted whether or not anything is picked:
  the first pick opens it from no height, the last closes it while still showing that photo, and added or removed
  tiles widen or narrow in place with the row scrolling to keep a new one in view. `onExited` fires when the close
  finishes. Space the host wants around it goes in `className` as a margin so it opens and closes with the row.
  The scroll to a new tile runs frame by frame on the slide's curve: `scrollTo({behavior: 'smooth'})` clamps to the
  width at its start, before the tile has grown, and stops short.
- `VideoMark` prints a length as `m:ss` or `h:mm:ss`, rounded down, so 59.9 seconds reads `0:59`; negative or
  non-finite reads `0:00`.

## Photo editor

- `PhotoEditor`: full-screen editing of the picked items, a black screen sliding up like `MediaViewer` with a pager,
  a strip of picked items and the crop & rotate tool. Cancel (the close button, Escape, Android back) asks to leave
  without keeping changes; the host decides and asks first when something changed. There is no tap-to-close or
  pull-to-close, either of which would throw away edits on a stray touch. Videos and GIFs are in the pager but the
  tool is greyed with a line saying why; a photo the host has not read shows its square preview and says so.
    - Crop mode hides the pager, strip and send, shows the whole photo as turned and mirrored so far, and works on a
      draft held here. Apply reports it through `onEditChange`; Cancel and Escape drop it; Reset only sets the draft
      back to the untouched photo and still needs Apply. It opens only on a photo with `src`, `width` and `height`
      that is `editable`.
    - Radix never closes the dialog on its own (the host decides what leaving means). Presses on a toast or a host
      dialog drawn above the editor must not close it. While sliding away nothing is pressable; Radix's modal layer
      sets `pointer-events: auto` inline, so the guard is explicit.
- `photoEdit.ts`: an edit is instructions, not pixels. Reading order against the photo as decoded (EXIF orientation
  already applied): mirror left-right if `flipH`, turn `rotation` degrees clockwise (that is the displayed image),
  then keep `crop`, normalised to the displayed frame. "Rotate left" and "flip" act on the displayed image whatever
  is already applied and keep the crop framing the same content. The editor, the previews and the export all read
  one edit through `planPhotoEdit`.
    - Output size scales down uniformly to fit `PHOTO_EDIT_MAX_AREA` (16,777,216 pixels, the iOS WebKit canvas area
      limit past which a canvas draws nothing and raises no error) and an optional max edge; it never scales up.
    - Crop spans snap to whole pixels so an unscaled export copies pixels one to one instead of resampling. A crop
      within a float's breadth of the frame edge counts as uncropped so a box dragged back to the edge costs no
      re-encode. A corrupted edit (non-finite numbers) draws the whole photo.
- `EditedPhotoImage` draws an edit without touching a pixel: the element is laid out at the original's size and one
  CSS `matrix()` (the same one the export uses) maps it into a frame the size of the edited result, which clips. The
  rendition may be smaller than the original; it is stretched first so a crop measured against the original frames
  the same part. The box is re-measured on resize (a rotated phone); until it has a size nothing is drawn.
  `max-w-none` keeps the base style from capping the original-sized image at its container.
- `PhotoCropStage` and `cropBox.ts`: handle targets are 44px (the smallest a finger reliably hits) centred on the
  box edge. Drag deltas are applied to the rect as it was when the drag began, so rounding never accumulates. With
  an aspect locked, a corner follows whichever axis moved further; an edge grows the other side about the centre and
  shifts back into the frame instead of stopping, so a box against the photo's top can still widen. A second finger
  is ignored, told by `isPrimary` rather than a held-drag flag, so a release the stage never saw cannot leave the
  box stuck to a finger that is gone. Pointer capture is taken as the press lands so a finger sliding off the box
  keeps dragging it.
- `photoGridLayout.ts`: cell 0 is the camera when there is one and photo `i` is cell `i + 1`. Previews are asked at
  rounded-up multiples of a step so a few pixels of width do not refetch. A pinch is one column step per 1.3
  spread ratio (a ratio, so a small hand and a large one take the same effort). On a column change the scroll is set
  so the cell under the fingers lands at the same height; without it the photo under them jumps away.
- `useBoxSize` holds the element in state, not a ref: inside a dialog the content mounts into a portal one commit
  after the component renders, and an effect keyed on a ref would have run on the empty one and never again. Without
  `ResizeObserver` the size is read once at mount.

## Audio and room files

- `AudioDetailLayout`: playback state comes in as props; the only state held is the seek bar's drag, so the clock
  can show where a drag would land. Before anything plays the right clock reads the whole length; afterwards it
  counts down what is left. A busy action cell (`busy`) is inert but not faded, since its spinner says why; a
  loading play button shows a spinner on the navy disc and cannot be pressed. Which action cells exist is the
  host's call. It pads itself for the status bar and the home indicator and takes the larger of the inset and the
  design's 24px floor, not their sum.
- `Waveform`: `bars` are heights 0..1 (usually 48). Absent, a decorative shape is generated from `seed` (FNV-1a
  hash into mulberry32 under a bell envelope) so one file always shows the same shape and two files rarely match;
  pure noise reads as static. With `onSeek` it is also a slider: the bars follow the drag and the position is
  reported once, when the finger lifts, so the audio is not asked to jump on every pixel; arrows step 5%. A bar
  counts as played as soon as the position enters it. A cancelled pointer is not a choice.
- `RoomMediaGrid`: plain `<img loading="lazy">` tiles, three columns with a 2px gutter, not `PhotoGridTile`, which
  is tuned for base64 previews with a skeleton cross-fade. A room's history can hold thousands of remote
  thumbnails and the browser should fetch only what scrolls near. Long press is `ROOM_MEDIA_LONG_PRESS_MS` (500ms);
  the click that ends a long press is swallowed on whichever tile it lands, including once the host has switched to
  selection mode, so the same press does not pick and unpick.
- `PhotoGridTile`: the lime badge shows pick order so the order the message will send in is visible while choosing.
  `disabled` is for unpicked tiles once the cap is reached. A video carries a play mark and its length clear of the
  ring.
- `AlbumList` replaces the grid while the title dropdown is open; `formatAlbumCount` is the host's, so digits follow
  the locale.
