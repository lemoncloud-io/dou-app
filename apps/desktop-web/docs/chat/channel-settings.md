# Channel settings

The channel settings panel is the trailing panel opened from the room header, a sidebar row's menu
or the header's member chip (which lands it on the member list). The code is
`src/app/features/channels/components/ChannelSettingsPanel.tsx`; where it sits among the other
trailing panels is in [`../shell/trailing-panels.md`](../shell/trailing-panels.md).

## Sections

Top to bottom:

- **Channel name**, with Rename for the owner.
- **Members**, with a filter once the roster is longer than five, "Remove from channel" for the
  owner, and "Add members".
- **Notifications**: all messages, mentions only, or off. A 1:1 (`stereo: 'dm'`) offers no
  "mentions only", and one stored that way reads as all: the server sends every message of a 1:1.
  The choice is kept on this device first and handed to the join outbox, which resends it until it
  lands; a write the server refuses is announced.
  The level in the join cache is mirrored into this device's copy (`useDesktopNotifications`), which
  is how a change made on another device arrives, and how a refused write puts back the level the
  join had (the outbox restores the join). In the channel list a mentions-only channel wears an `@` glyph and one that is
  off a crossed bell.
- **Channel ID**, group channels only (below).
- **Webhooks**, for the owner of a group channel only (below).
- **Leaving and deleting**: Leave for everyone, Delete for the owner. Either one closes the panel and
  clears the selected room once the server answers — about a second after the confirm, while the row
  has already left the list. Both apply only if that channel's panel and room are still the open ones
  (`closeIfOpenFor`, `clearIfOpen`), so a room or panel the reader opened in the meantime stays. The
  header menu and the sidebar row menu clear the room on the same rule.

## Add members

"Add members" opens `AddMembersDialog`, which adds the picked people at once with `channel.invite` —
no link, no accept step. The pool, from `useInviteCandidates`, is **the members of the active place,
minus the channel's current members and me**. The members come from the server's place member list
(`place.list-user`, read through `userRepository.listPlaceMembers` each time the dialog opens), so
someone with no channel at all — invited into the place only, accepted or not — and someone who
shares no channel with me are both offered. Pending invitees are not marked apart; the server has
nothing to tell them by.

- **Two exclusion sources** keep a current member out: the channel record's `memberIds` and the
  channel's roster, refreshed alongside the list. Either alone covers the happy path; both together
  survive a record without `memberIds` or a roster read that failed.
- **"Me" is my id in this cloud** (`useUidInCloud`) and the session's user id both.
- **The roster union is the fallback, never a supplement.** When the list fails — `403` to a
  non-member, or a cloud whose server does not have the action yet — the pool is the old one: the
  union of my channels' rosters, one request per channel. That only holds people I already share a
  room with. While the socket is unverified nothing is fetched and the cached rosters are served;
  the list is asked for on the false→true edge.
- **The second line** names the channels a person shares with me, read from the cached rosters. A
  member sharing none has an empty line.
- **Names** are the place profile's nick and picture over the user's own name and picture — the
  same merge the 1:1 picker and the message rows use. The list load fills the place profile cache
  for each page it reads, but only while the session is on the active place and no switch is in
  flight, since `profile.sync` answers for the session's place.

## Invite by phone

"Invite by phone" on a channel row opens `SendInviteDialog`, which issues a contact invite with
`invite.create` and copies its link. That request rides the relay slot, so the inviter is the relay
user, and the server issues invites to signed-in accounts only: a guest is refused with `403`, so
the row menu does not offer the entry to a relay guest (`isRelayGuest`). A place invite from the
same dialog goes through `user.invite` in the cloud instead.

A refused send keeps the dialog open with a sentence chosen by the status the rejection carries:
"sign in first" for a relay guest's contact invite, "not allowed" for any other `403`, "check the
number" for a `400`, the connection line for the client's own `408`/`499`/`503` (a timeout, a
dropped request, no socket), and the generic line otherwise. A rejection with no status falls back
to the wording (`classifyWireError`). The wire text
itself is shown under that sentence in the dialog, as the failure toast's description, and in the
log as `[INVITE] [SendInvite] failed` with `raw` — View › Toggle Developer Tools opens the console in
packaged builds too. The dialog stays open on a failure, and the error toast rises over its dim
(`docs/shell/layering.md`).

### Invite links

- **Every link this client issues lives one day** (`expiresDays: 1`), the same lifetime the web app
  gives its invites. It is defaulted in `useDesktopInviteMutations`, not at the call sites, so a new invite
  and a re-invite cannot drift apart. The invite repository is gated to the Default Cloud, so callers
  gate entry there rather than the hook guessing.
- **A place invite answers differently.** `user.invite` puts the link in `Location`, where
  `invite.create` answers with `deeplink`. The hook copies it into `deeplink`, so callers treat both
  kinds alike; without it every place invite was reported as having no link.
- **Cancelling needs the full code**, `invt:<id>:<code>`. The sender never persists a code (it is a
  credential): `invite.list` rows carry `id` and `code` because the inviter owns them, and the full code
  is assembled right before the call and never logged or stored. A cache-first row has no `code` yet, so
  the code is taken from the current list first, the server is asked once more on a miss, and a second
  miss is a failure rather than a retry loop.
- **The waiting dialog's countdown** rounds up, so zero means the link has expired (400 ms left reads
  one second). It turns urgent at ten minutes or less, compared in milliseconds, not floored minutes,
  which would also trigger at 10:59. Each tick lands just after the instant the displayed value next
  changes (every minute while days remain, every second after), so a late timer cannot freeze and then
  jump, and it stops at expiry.

## Channel ID

A service that posts notifications into a channel (a webhook) is pointed at the channel by its id.
The web client shows that id in its address bar; the desktop app has none, so the panel shows it,
selectable as one piece, with a Copy button. Copy puts the id on the clipboard and the button reads
"Copied" for a moment, the same feedback as the User ID on the profile page (`useCopyToClipboard`).

A 1:1 and the self channel do not show it. Neither is somewhere a service posts to, and the panel
has no use for the id there.

## Webhooks

The owner of a group channel manages the channel's webhooks here. A section appears between Channel ID
and the leave/delete group only when the viewer owns the channel (`isChannelOwner`) and the channel is
not a 1:1 or the self chat — the same rule that hides the Channel ID. Everyone else never sees it, and
the hook behind it never reads the list for them. The section is
`ChannelWebhooksSection`, its data is `useChannelWebhooks`, and the data layer is
[`libs/data/docs/remote/socket.md`](../../../../libs/data/docs/remote/socket.md#webhook).

- **List.** One row per live webhook: its name ("Unnamed webhook" when empty), a "Last used" date or
  "Never used", the expiry date or "No expiry", and a badge for Paused (`disabled`) or Expired
  (`expiresAt` in the past; `0` is never). The list is read when the socket is verified, again on the
  unverified→verified edge, and on "Try again". It shows a loading line, an empty line, or an error
  line with that retry.
- **Issue.** "New webhook" asks for an optional name and an expiry (none, 7, 30 or 90 days) and then
  shows the **token and the endpoint URL once**, each with a Copy button. The URL is the `Location` the
  server returns on issue; a server without an endpoint configured returns none and the dialog says so
  instead of guessing one. The token is held in the dialog's own state and nowhere else — not the
  repository, a store, the cache or a log — and any close of the dialog drops it. It cannot be read
  again, so the dialog says to copy it now.
- **Pause, resume, expiry.** Pause/Resume sends `disabled`; the expiry menu sends `expiresAt` for the
  chosen preset (`0` = never). Each row is disabled while its write is in flight. The row changes only
  after the server accepted the write; a refusal leaves the row as it was and raises a failure toast
  with the wire text.
- **Delete.** Behind the confirm dialog, which names the webhook; the services using it can no longer
  post.

A cloud server that does not have the webhook action yet answers an error, which the list shows as the
error line. The posted messages themselves are drawn as in [webhook-messages.md](./webhook-messages.md).
