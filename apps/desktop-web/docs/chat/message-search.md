# Message search

`Mod+Shift+F` opens `SearchDialog` (`src/app/features/search/`), hosted by the channel list next to the
quick switcher for the same reason: the channel list and its select handler already live there. It
searches the messages this device has cached, and says so.

## What is searched

There is no search endpoint on the server, so the search is local, as in the web app. For each channel
(at most 30, in the order given; past that the dialog says the search covered only the first ones) it
reads the channel's most recent cached page of up to 200 rows with `cacheReadList`, which touches no
network, so typing never fans out feed requests. Results are best effort: they cover what is already
cached. A query of fewer than two characters searches nothing; typing is debounced.

A row counts as a hit only if its text contains the query (case-insensitive) and it is a real message:

- **Reaction events are chats too**, and a **deleted message keeps its text in the cache** while the
  feed shows a tombstone; neither may surface.
- **Thread replies stay.** Choosing one opens its thread, since the main feed never renders replies and
  scrolling it for one could only fail.

Each channel shows at most its three newest matches and the count of all of them; channels with more
matches come first.

## Telling "no match" from "nothing to search"

- **Nothing loaded.** A cold start has nothing cached, and that is a different answer from "no match".
  When zero rows were scanned the empty state says nothing has been loaded yet and that opening a
  channel changes it (it used to say "nothing here" for every query, with no hint why).
- **A channel that cannot be read** is not a channel with no match. A failed cache read leaves its rows
  out of both the results and the scanned count, so the dialog says the result is incomplete instead of
  claiming a verified no-match.
- **The empty line states the scope** (local and bounded), so an empty result does not read as "this was
  never said"; the dialog's description carries it once and no second footer repeats it.
- **With no message to show,** a channel whose name contains the query is offered (up to three), because
  that may be what the reader wanted. The offers are options like any row, though the first one looks
  like a group heading: it is announced as an option, since a screen reader would otherwise hear a heading
  that answers Enter.

## Scope and rows

- When the channel open behind the dialog is one of the searched ones, a toggle narrows the search to
  it (the reader usually wants the room they are looking at); otherwise the dialog stays place-wide
  with no toggle. Each opening resets the query and the scope, since the open channel may be a different
  one by then.
- Each hit carries its sender, so two hits from different people do not read as the same line twice. The
  name is the sender's nick in the channel's place when there is one, else the account name, as in the
  feed and the OS banner. The row's own owner snapshot is left out on purpose, so that only a nick can
  come back from the place lookup. Until the name resolves the row is blank, since a stand-in name
  flashed on every row and then changed. A message of mine carries my id in the channel's cloud, while
  my nick can sit under my account id, so both are tried.
- The result count is held back while a search runs: the previous count stayed up and jumped (4, then 13) as the cache filled in.
- A match row jumps to the message (`chatNo`): the feed scrolls to it and flashes it; without that the
  row could only open the channel and drop the reader at the latest message. A channel header opens the
  channel. The listbox is one flat list, each header then its matches, so the arrow keys walk every
  result in the order drawn.
- The channel set handed to the dialog must be stable across renders: a fresh array per render reads as
  a new channel set, and the search's effect then sets state on every render until React aborts the tree.
