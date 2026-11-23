# The Home sidebar

`ChannelList` draws the Home destination's sections: Favorites, Channels and Direct messages, under
the header with search, Threads and Saved. The Channels and DM destinations use a different list, see
[lists.md](./lists.md). The sidebar stays mounted, hidden, while another destination is open, because
it writes the order the next-unread shortcut walks and holds the quick switcher and message search;
unmounted, the shortcut would walk an order frozen at the last Home render and ⌘K would stop answering.

## What a row shows

- **Preview.** Rows are one line; the last real message rides along as the row's hover tooltip, kept out
  of the accessible name. It comes from `useLastChat`, which skips thread replies, reaction events and
  system rows (the channel record's last chat cannot stand in: a reaction to an old message would
  become the preview). A deleted message prints a one-line "deleted" preview, not its content. The
  subscription and freshness fetch for the preview are opened only when the pointer or focus first
  reaches the row, and the tooltip waits 600 ms: one live subscription per channel on mount was the
  cost of a preview nobody had asked for, and skimming should not pop a tooltip on every row.
- **Unread shape.** `unreadIndicator` decides only the shape: a dot for channels, the count for DMs, and
  nothing on the open row. Channel traffic is ambient (3 or 47, you open it and skim); a DM's count is
  reply debt. A count on every row would make every row equally loud. The place and cloud rails always
  dot and do not go through this. The name turns bold from the same answer, so the two cannot drift.
  The unread marker is decorative with screen-reader text, deliberately not a status region: one live
  region per unread row would make a screen reader announce the whole sidebar whenever a count moved.
- **Muted rows.** "Mentions only" and "none" both dim the name, each with its own glyph, because a channel
  that still tells me when I am called is not one that is off. A muted channel that looked the same as
  a quiet one read as a bug. An unread row also shows an `@` pill when one of its unread messages
  called me, read from the mentions inbox rather than the last message (which is not the only message
  that can have called me).
- **Draft.** A pencil appears on a row whose composer holds unsent text, except the open row, whose
  composer is in view.
- **People with no 1:1 yet** are listed after the 1:1s, by name, and starting one is a click. Their row
  is `aria-disabled` while any start is in flight, never `disabled`: a disabled button leaves the tab
  order, the pressed row would lose focus and the arrow-key walk would stop on it. A row still waiting
  for its person's name is a placeholder; it is never drawn with a raw id and has no label to show,
  open or drag.

## Sections, folding and order

- Folding hides the quiet rows, not the ones asking for attention: the open channel and anything
  unread stay listed, so folding a busy section never hides that something arrived. Which sections
  are folded is remembered across launches and survives logout.
- Order inside Channels and DMs comes from the stored order, applied by channel id: stored ids first in
  that order, ids it does not know in name order behind. DMs are ordered by the names they show, not
  by the server-set room names they carry. My notes-to-self room is pinned at the top of DMs, and no
  stored order, name sort, drag or keyboard move displaces it or moves a 1:1 above it. Channels and
  DMs share one stored array; a move rewrites only the moved section's slice and keeps the other's.
- Favorites repeat their rows in their own section, so a starred channel stays reachable from the top
  and keeps its place in Channels or DMs. The Favorites order is the pin order itself. Only the
  canonical row owns the scroll anchor. Favorites are scoped to the active place.
- Every section keeps its heading while empty (unfiltered) and says what goes there, so the first
  channel or 1:1 has a section and a "+" to start from. A filter shows only the sections it matched.
  On the Default Cloud there is no "+" for channels, and a 1:1 starts from a phone number, which only
  the mobile app does, so the empty line points there instead of leaving a heading with no way in.
- While the first names of the place's people are loading, the DM section is one block of
  placeholder rows. Drawn row by row it would re-sort as each name arrived.

### Dragging and moving by keyboard

There is one drag context per section, so a drop into another section is impossible by construction
(a cross-section drop would imply favorite semantics). A press that moves less than 5 px is a click.
The click a browser fires after a drop ends anywhere is swallowed by a flag that clears itself on a
timeout; otherwise it would select the row under the pointer, or, when the release lands off the
originating row, the next legitimate click.

- Rows lock while a filter is on or the section is folded, because a reordered subset would write a
  partial order.
- Alt+Shift+↑/↓ is the keyboard twin: it reorders inside the selected row's own section, with the
  same locks, and a move at the edge is clamped. Keyboard drag is deliberately not supported (the
  drag wrapper carries no tab stop).
- React moves a node with `insertBefore`, and the browser blurs a focused node that it moves, so the
  next chord would never reach the list. The list remembers the focused row at the chord and gives
  focus back after the next commit, only if focus fell to the body: a clamped no-op move commits
  nothing, and the reader may have focused something else on purpose by then.

## Keyboard and dialogs

- Arrow keys move focus between rows; Enter or Space on the focused row opens it. Selecting on every
  arrow press mounted each channel's feed in turn and threw away the reading position of the channel the
  reader was in. With nothing focused, the first arrow enters at the selected row.
- The quick switcher and search are React children of the list but render through a portal, so their
  keys bubble to the list in React's tree while sitting outside it in the DOM. A guard ignores keys
  whose target is outside the nav; without it ArrowDown inside an open dialog moved focus to a row
  behind the modal and the next Enter switched channel instead of opening the result.
- Browser and OS chords such as Ctrl+arrows pass through.
- The dialogs mount on every branch, loading and empty included: ⌘K is the way out of a place with no
  channels, and a filter that matches nothing must not take ⌘K and search down with it.

## Row context menu

Every row's right-click menu opens one shared dialog stack, rendered once in the list and aimed at the
last right-clicked row (a dialog per channel would be hundreds of mounts). A removal clears the
selection only if the removed row is the open channel, and only when the server answers, which is about
a second after the confirm. The menu's trigger sits on a plain wrapper with `display: contents`:
composing the Radix context-menu trigger onto the row's tooltip trigger was observed to drop
`onContextMenu`. The mark-as-read item writes the local cursor first, then the channel's own cloud's
repository, whose outbox resends until the server has it; only a read the server refused for good
rejects, and only that is announced. Sending an invite needs a signed-in account (the relay refuses a
guest) and works from any cloud; a 1:1's menu has no rename, members or delete.

## Quick switcher (⌘K / Ctrl+K)

- With no query the list is the channels opened most recently, topped up from the rest. With a query,
  names that start with it come first, then names that contain it, at most eight rows. It matches what
  the row shows: matching the room's own name found a DM by an id nobody sees and never by the
  person's name.
- Channels in the cloud's other places are searched, never listed for an empty query (the recents are
  about where you were, these are about where you are not). They keep up to three rows even when this
  place fills the list, so a common word does not hide them. Each shows its place, because picking it
  moves the app there.
- A name that matches no channel may be a word from a message, and the dialog offers the message search.
- It opens with a fresh query every time.
