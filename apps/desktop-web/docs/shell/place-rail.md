# Place rail

The second rail lists the places of the active cloud (`PlaceRail`). A place is a site inside a
cloud; selecting a tile moves the socket session into it (`useSelectPlace`), and the sidebar then
lists that place's channels. On Home, and for a guest, the rail shows a single Home tile: the
default cloud has no places to choose between.

The tiles come from the place cache (`usePlaces`), which the runtime's background sync keeps
current. Nothing on the rail fetches.

## Making a place

After the last place tile there is a **New place** tile, when the account can make one here.
`canCreatePlace` decides that, from two things:

- **The account's role allows it.** A guest may not make a place, and neither may a session that is
  not active in a cloud. Both come from the session (`useRuntimeProfile`), which reports the role of
  the cloud user while a cloud is connected.
- **The cloud is the account's own, and open.** Home has no places to add to, and a cloud joined by
  invite is its owner's to arrange. A suspended or expired cloud cannot be entered, so nothing can
  be made in it.

This is the same rule the mobile app applies. It only decides whether the tile is drawn: the server
still refuses a create it does not allow, and the dialog says so.

A cloud holds up to 10 places (`PLACE_MAX`; a relay subscription row in the list is not counted).
At the cap the tile stays, and clicking it says so and points at the mobile app, where another
cloud is made — a tile that disappeared would only raise the question of where it went.

The tile opens `CreatePlaceDialog`, which asks for a name of up to 20 characters and, optionally, a
photo. A photo over 10 MB is refused before it is read; one that cannot be encoded is refused after.
Either way the dialog says so and keeps whatever photo was picked before. While a photo is being
read the submit waits, so a place is never made without the photo the form goes on to show. The
photo is resized the way a profile photo is (`prepareImage` with `AVATAR_IMAGE`) and goes out as the
place's thumbnail in the create call.

Submitting does two things in order, and they can fail apart:

1. **Create.** `useCreatePlace` asks the place repository to make the place. The repository writes
   the new row into the place cache before it answers, so the tile appears on the rail without a
   refetch. A failure here is shown in the dialog by kind: a refusal says the account cannot make
   places here, an unreachable server says to check the connection, and anything else asks to try
   again.
2. **Enter.** The dialog then switches the session into the new place and waits for the switch. Only
   when it lands does the dialog close.

If the switch fails, the place already exists. The dialog stays open, says the place was made but
could not be opened, and locks the name and photo: the place already carries them. Submitting
again only retries the switch, so a retry never makes a second place. Closing the dialog at that
point is fine too — the new tile is on the rail and can be clicked like any other.

While either step runs, Escape, the close button and the backdrop do nothing, so a failure message
always has someone to read it.

Once the session is inside the new place, the dialog closes and the home page opens the place
profile dialog (`EditPlaceProfileDialog`) for it — the name and photo the person goes by in that
place. It opens only after the switch has landed, because a place profile is written into the place
the session is in; opened earlier it would have edited the profile of the place being left. Unlike
the mobile app, which holds the person on that step, it is the ordinary edit dialog and can be
closed to keep the account profile.

### Why the switch goes through the rail's own hook

The dialog does not call the session's site switch itself; the home page hands it `enterPlace` from
the same `useSelectPlace` the rail uses. The "a switch is in flight" flag belongs to one mutation
observer, so a switch started from a second observer would leave the rail's tiles unlocked and the
home page's idle auto-select running against a selection that is still moving. `enterPlace` differs
from the tile's `switchPlace` in one way: it rejects on failure instead of raising a toast, because
the dialog is still open and is where the failure belongs.

`enterPlace` also joins a switch into the same place that is already running, and does nothing when
the session is already there. That case is real: in a cloud with no place yet, the home page
auto-selects the first place to appear, and a new place appears in the cache before its create call
returns. Without the join, one new place sent two switches.

The home page closes the dialog when the active cloud changes, and the dialog forgets everything on
every close — a place it made but could not enter belongs to the cloud it was made in. That holds for
a create still in flight when the dialog closes too: its answer is dropped, so the session is not
moved into a place of the cloud that was just left. The place itself is made, and is on that cloud's
rail the next time it is opened. A close that lands after the switch was sent cannot call it back;
only the dialog's own follow-up, the notice or the failure line, is dropped then.
