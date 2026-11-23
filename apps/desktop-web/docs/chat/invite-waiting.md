# Sent invites: the waiting dialog

After "Invite by phone" sends a channel invite ([channel-settings.md](./channel-settings.md#invite-by-phone)),
the sender lands on `InviteWaitingDialog` (`src/app/features/channels/components/`): the live status of
that one invite, with copy link, cancel and reissue. A place invite has no waiting screen: its link is
the thing to share, so the send lands on a link dialog (`PlaceInviteLinkDialog`) instead. The link is
shareable by design and is held in memory only, never persisted.

## How the status is learned

The sender learns of an accept only by asking again, so the dialog reads `invite.list` when it opens
and every 30 seconds while it stays open. The read goes through a ref to the repository, because the
repositories object is not identity-stable across renders and putting it in the effect's dependencies
would re-subscribe the poll on every render.

The invite is found by its id in the list. What each state does:

- **Accepted** hands off to the invite's channel (it is selected) and closes.
- **Canceled** closes quietly.
- **Rejected** (the invitee declined) offers a reissue and shows no countdown, since a declined invite
  cannot be accepted and its clock means nothing. A pending invite shows the time left; an expired one
  offers a reissue.
- **Missing** closes the dialog only after the row has been seen at least once. The poll right after a
  reissue can land before the server mirrors the new row, and that absence is not "gone". An id that was
  never seen stays on its loading state, with its close button.
- **A failed re-ask keeps the last list.** An empty list would read as "gone" to the rule above and
  close the dialog without telling the sender; the caller falls back to an error toast.

## Cancel

Cancel is behind a confirm. The invite's code is not in a cache-first row, so it is resolved against
the current list first and then, if needed, by one re-ask, before giving up. If the cancel fails, the
list is read again: an invite that turns out accepted, canceled or gone means the confirm simply closes
(the states above then tell the truth) instead of reporting an error about a race. The busy flag is set
before the code resolution, because resolution can take a network round trip and an unset flag across
that window would let a second click submit twice.

## Reissue

Reissue sends a new invite to the same recipient (the dialog opens with the sender's memory of the
phone, name and channel; without it there is nothing to reissue with).

1. **Retire the prior invite first.** A pending one must actually cancel; issuing before that would leave
   two live codes for one number. If that cancel fails and the invite turns out accepted meanwhile, the
   reissue stops. An expired prior is best-effort tidying and never blocks the reissue.
2. **Carry the channel over.** A reissue without it issues an unbound invite, and accepting that no
   longer lands the recipient in the room.
3. The new link is copied, and the dialog switches to the new invite id in place. The list is cleared
   _before_ the watched id changes: otherwise the rule above would read the stale absence of the new
   row as "gone" and close the dialog it just opened.

The dialog cannot be dismissed while a cancel or reissue is in flight.
