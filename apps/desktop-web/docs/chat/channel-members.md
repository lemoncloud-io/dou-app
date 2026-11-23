# Channel members: loading, adding, removing

Behind the member list in the channel settings panel ([channel-settings.md](./channel-settings.md)) and
the add-members dialog. The hooks are in `src/app/features/channels/hooks/`.

## Loading the roster (`useChannelMembers`)

The list observes the user cache (member identity plus the embedded `$join` read state) and is filled
by two network paths that complement each other:

- `refreshList`: a one-shot full snapshot of the members and their `$join`.
- `syncChannelUsers`: an incremental delta keyed by a `since` cursor, advanced with each answer.

The member list has no background sync plan in the runtime, so these two loads are the only things that
hydrate members.

- **The verified gate is load-bearing.** The loads wait until the session is verified, which avoids a
  stale, mis-scoped read in the middle of a switch, and, as a dependency, they run again on the
  unverified-to-verified edge after a reconnect or switch.
- **A failed delta does not hide the roster.** Its error is tracked apart from a snapshot failure
  (which does hide it), so the list on screen stays and is shown with a note that it may be stale. A
  failed delta also does not advance the cursor: the next trigger retries from the same point. The
  cursor is reset when the channel changes, so a new room starts fresh.
- **Retry** re-runs the snapshot and delta pair together; it is what both error states offer.
- **The owner is flagged off the network path**, by comparing each member's id with the channel's
  `ownerId` passed in (usually from the selected channel), so an owner change never refetches.

## Adding (`useAddMembers`)

Adds already-registered users with `channel.invite` and writes the picked records into the user cache
itself. The member list reads that cache (`channelIds`), which the channel-side invite response never
touches, so the records are written straight in rather than refetched (`cacheWriteMany` unions
`channelIds` per user). The candidate's `$join`, a read cursor from whichever channel they were found in,
says nothing about this channel and is dropped from the written record.

The cache write is best effort: the server has already accepted the invite, so a local write that fails
must not surface as a failed invite (the caller would toast an error and retry, inviting the same people
twice). The member list reconciles on its next refresh either way.

## Removing

Removing someone (owner only) is invisible from the roster alone if the list has not caught up yet, so a
toast says it happened, as delete and leave do, and offers **Undo**: re-adding is the same invite the
add-members dialog sends, so a misclick costs one more click. The removal answers about a second after
its confirm; by then the reader may have opened another room or its settings, which stay open.
