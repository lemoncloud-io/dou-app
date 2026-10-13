# 0198. The threads list is the active place's, and a 1:1's threads are the cloud's

Date: 2026-10-13

## Status

Accepted, for desktop-web. Narrows what [ADR-0196](./0196-the-threads-i-take-part-in-are-listed-from-what-this-device-has-seen.md)
lists; how the list is kept and fed is unchanged.

## Context

ADR-0196 listed every thread of the active cloud, and named the place on a row that lived outside the
current one. In a cloud with several places the pane then showed all of them at once: standing in one
place, most rows belonged to others. Everything else beside the pane — the channel list, the unread
counts, the place profile — is the active place's, so the pane was the one surface that was not.

A thread carries the `sid` of its channel. For a group channel that is the place it lives in. For a
1:1 it is not: the server stamps a 1:1 with whichever place its creator stood in, the other
participant need not be in that place, and the channel list already refuses to use that tag as a
scope key. The Self Channel belongs to the account and every place of its cloud lists it.

## Decision

- **A group channel's threads are listed in its place only.** The pane, **Mark all read** and the
  sidebar dot read one scope, so a dot never points at a row the pane does not show, and marking all
  read never clears a thread the reader cannot see.
- **A 1:1's and the Self Channel's threads are listed in every place of the cloud.** A 1:1 belongs to
  the cloud, not to a place.
- **The place is the one the channel list is read for** — the session's selected site, unless the
  cloud has no place left. With none (the Default Cloud, usually) the list is the whole cloud's.
- **The row no longer names a place**, since a row from another place's group channel no longer
  appears. The empty state says the list is this place's, because another place may hold threads.

## Alternatives

- **List a thread wherever its channel is listed**, using the channel list's own rule for which places
  show a 1:1 (the places where its peer shares a group channel with me). It would match the sidebar
  exactly, but a 1:1 thread would then be missing in a place that does not list its room — and a 1:1 is
  the cloud's, so it was decided to show them all.
- **Keep the whole cloud and group the rows by place.** Keeps everything reachable from one pane, but
  leaves the pane out of step with every other place-scoped surface.

## Consequences

- A thread in another place's group channel is not reachable from the pane until that place is
  opened; its unread reply lights no dot here.
- A 1:1 thread can be listed in a place whose sidebar does not list that 1:1. Its row then shows who
  started the thread but no channel name — a 1:1's name is its person, resolved live from a loaded
  channel — and opening it switches to a place that lists the room.
- The Self Channel holds a separate set of messages in each place, so a thread of it listed here may
  have been written in another place; opening it switches to that place.
- The relay's 1:1s are treated the same, though they do live in the relay's one place. It only shows
  after an invite join selects a site on the Default Cloud.
