# places

The two pages that act on one place from outside the place rail (`src/app/features/places/pages/`):
the place's settings, and a bulk manager for its channels. Making, editing from the rail and deleting
a place are in [`../shell/place-rail.md`](../shell/place-rail.md); the places of a cloud, as the
account hub lists them, are in [`../account/`](../account/README.md#a-clouds-places).

| Route                       | Page                | Reached from                                                                    |
| --------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| `/places/:placeId/settings` | `PlaceSettingsPage` | the place tile's menu (**Place settings**), the account hub's cloud places list |
| `/places/:placeId/channels` | `PlaceChannelsPage` | the **Manage channels** entry on the settings page                              |

## Place settings

The page finds the place by id in the place cache (`usePlaces`). While the cache loads it shows a
spinner; an id that is not in the cache shows "not found" with a button back to Home.

It shows, for everyone: the photo (a pin when there is none), the name, the description (or a line
saying there is none), and, when the row has them, the creation date and the owner's name. Then the
entries that act on the place:

| Entry           | Shown to                      | What it does                                                               |
| --------------- | ----------------------------- | -------------------------------------------------------------------------- |
| My profile      | the place the session is in   | opens the place profile dialog: the name and photo the person goes by here |
| Edit place      | the place's owner (`isOwner`) | opens the edit dialog for the place's name, photo and description          |
| Manage channels | everyone                      | opens the bulk channel manager                                             |
| Notifications   | everyone                      | sets one level for every channel of the place                              |

My profile is limited to the active place because its dialog has no place parameter and always edits
the place the session is in; offered on another place it would edit the wrong one. Edit place is
limited to owners, who alone rename a place; everyone else reads it. The rule is the row's owner
flag, not the administrator role the rail's own edit and delete menu uses (see
[`../shell/place-rail.md`](../shell/place-rail.md#who-manages-places)), and the server decides in
both cases what is allowed.

The two edit buttons only raise a flag in the dialogs' stores, so the page mounts `EditPlaceDialog`
and `EditPlaceProfileDialog` itself: the home page that mounts them on `/` is not rendered on this
route, and without its own copies the buttons would open nothing until the person went back Home.

### This place's notifications

The section above Manage channels sets one level (all messages, mentions only, off) for every channel
of the place, writing each channel's own setting, and counts the channels set differently with a
link to the channel manager. Opened for a place the session is not in, it only remembers the level
and says it reaches the channels when the place is opened. How the level is written, how a new
channel inherits it, and what it cannot reach are in
[`../chat/notifications.md`](../chat/notifications.md#place-and-cloud-levels).

## My profile in this place

The name and photo a person goes by in a place (their place profile) are edited from the **My profile**
entry above and from the profile page (`/profile`, `src/app/features/profile/`). The profile page has
two cards: **This place**, how the person appears in the current place, and **Account**, the
read-only account identity, which links to the account hub instead of repeating it (the account
card reads the relay session; see [auth](../auth/README.md#social-login)). With no place selected
(the Default Cloud) there is nowhere to save a place profile, so the This place card is not offered.

- **The card waits for its read.** Whether a place profile exists is known only once the page has read
  it (or the cache already holds my entry), so the card is drawn after that. Drawing it earlier showed
  "Set up" and flipped to "Edit" behind the dialog. What is shown is the place profile when there is
  one, else the account's name and photo.
- **The dialog seeds in layers.** It fills the form at once from the cached place profile (my own
  entry, keyed by my id in this cloud, which is not always the session's id), falling back to the
  account's name and photo, then replaces the fields with the freshly read profile: loaded, else
  cached, else account. A guest's "Guest" is how the app names it, not a nick it chose, so it is
  never put into the nick field and only shows as the placeholder.
- **Saving means using it.** There is no separate "active" toggle: saving a nick and photo sets the
  place profile active. **Use account profile** deactivates it (the server keeps the nick; display
  falls back to the account). It is offered only while a place profile is active, so it never reads
  as deleting something that was not set, and it sits in a block of its own with its consequence
  stated rather than beside Cancel and Save, where it would look like a third way to close.
- **Focus returns to the nick field** whenever the form comes back from loading or saving. Both disable
  the field, and a disabled input cannot hold focus, so without this focus fell to the page behind
  the dialog, away from the field a failed save needs corrected.

## Managing channels

`PlaceChannelsPage` lists the channels of the place in the URL (`useChannels`), each row with a
checkbox, its name (named as the sidebar names it, so a 1:1 reads as the other person), an unread count when there is one, a pin star and a remove button. The back
button returns to wherever the person came from.

### Bulk actions

Ticking rows shows a bar with the count and three buttons:

- **Pin selected** pins the unpinned rows in the selection and leaves pinned ones pinned: toggling a
  mixed selection would unpin what is already pinned. Pins are stored per cloud and place
  (`placeScopeKey`), so they are the pins the sidebar shows for that place. The star on a row toggles
  that one channel on its own.
- **Mark selected read** does what a row's mark-as-read does, for each selected channel with a last
  message: the local read cursor moves first, so the badge clears at once, and then the read goes to
  the channel's own cloud's `join.readChat` (`runtime.data.getCloudRepositories(cid)`), whose outbox resends it until
  the server has it. A channel with no messages is skipped. Only a read the server refused for good
  (the room left or gone) counts as failed, and one `sidebar.markReadFailed` toast is shown for the
  whole batch rather than one per row; a read still waiting on the socket says nothing.
- **Clear** drops the selection.

Selection is not cleared by pinning or marking read, so the same set can be acted on twice.

### Delete and leave

The remove button on a row depends on who the person is in that channel:

- **The channel's owner** (`isChannelOwner`) sees a trash icon and **Delete channel**. The confirmation
  says the channel and its history go away for everyone and cannot be undone.
- **Anyone else** sees a leave icon and **Leave channel**. The confirmation says the person stops
  seeing the channel and can be invited back.

Both go through a confirmation that names the channel; nothing destructive runs unconfirmed. The
repository drops the channel from the cache before the server answers, so the row leaves the list at
once and the channel leaves the selection. A refusal puts the cached row back and shows one toast
("could not remove the channel", with the server's words under it — `docs/shell/failure-toasts.md`). The confirmation closes when its button is pressed, so the outcome
is the row leaving or coming back with that toast.

The page does not look at the person's role in the place: what a delete or leave is allowed to do is
decided by the server.
