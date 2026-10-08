# Place rail

The second rail lists the places of the active cloud (`PlaceRail`). A place is a site inside a
cloud; selecting a tile moves the socket session into it (`useSelectPlace`), and the sidebar then
lists that place's channels. On Home, and for a guest, the rail shows a single Home tile: the
default cloud has no places to choose between.

The tiles come from the place cache (`usePlaces`), which the runtime's background sync keeps
current. Nothing on the rail fetches.

## Making a place

After the last place tile there is a **New place** tile, when the account can make one here.
`canCreatePlace` decides that, from three things:

- **The account's role allows it.** A guest may not make a place, and neither may a session that is
  not active in a cloud. Both come from the session (`useRuntimeProfile`), which reports the role of
  the cloud user while a cloud is connected.
- **The cloud is the account's own, and open.** Home has no places to add to, and a cloud joined by
  invite is its owner's to arrange. A suspended or expired cloud cannot be entered, so nothing can
  be made in it.

- **The account manages places.** `readPlaceManageAccess` answers that, and the section below says
  how.

The first two are the rule the mobile app applies; the third is the desktop's own. All of it only
decides whether the tile is drawn: the server still refuses a create it does not allow, and the
dialog says so.

## Who manages places

Making, editing and deleting a place on the desktop are for one kind of account for now: an
administrator. `canManagePlaces` is the rule, and all three actions read it, so they cannot drift
apart.

- **The role is the relay account's**, read from the relay token (`getRelaySessionUser`), not from
  the session. Inside a cloud the session reports the cloud user, who has a role of their own there;
  read from that, the answer would change from cloud to cloud for the same person.
- **A development build also lets the team's two shared sign-ins through**, by email
  (`developer@lemoncloud.io` and `app@lemoncloud.io`), so the feature can be exercised on the
  development server without an administrator account. The list is applied only when the stage baked
  into the bundle (`VITE_ENV`) names `LOCAL` or `DEV`. A production build never reads it, and
  neither does a build whose stage is missing: the value is read raw for that reason, since the
  config registry takes a missing stage for `LOCAL`.

An owner who is not an administrator sees no **New place** tile and no place menu on the desktop,
and still makes places in the mobile app. The rule hides entries; it is not what protects a place.
The server decides what an account may do, and a refusal is shown where the action was started.

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

## Editing a place

Right-clicking a place tile opens its menu, for an account that manages places in a cloud where a
place could be made (the same `canCreatePlace` answer that draws the **New place** tile). The Home
tile has no menu, and neither does the relay subscription row that shares the list: it is not a
place anybody made (`isManagedPlace`).

**Edit place** opens `EditPlaceDialog` on that place, with its name and photo as they are. The name
keeps the 20-character cap and the photo the 10 MB one, read and resized the same way as in the
create form. Save stays off until something differs from the place, and while a photo is being read.

Only what changed is sent (`useUpdatePlace`): a name left alone is not written again, and a removed
photo goes out as an empty one, the value the web app sends for the same edit. The repository writes the change
into the place cache before the server answers, so the tile changes at once, and puts the old row
back if the server refuses. A refusal keeps the dialog open with what was typed and says whether
trying again can help.

The form is not the create form with a mode. Making a place has a second step, entering it, and a
retry state between the two; folding an edit into that would put a branch through every part of it.

The dialog names a place by id, and that place belongs to the cloud it was opened in. So it closes
when the place leaves the rail, which a cloud change does too since the rail lists the active
cloud's places only, and an answer that arrives after that is dropped.

## Deleting a place

**Delete place** is the second item of the same menu, under the same rule. It asks first
(`ConfirmDialog`), naming the place, because a delete removes the place for everyone in it and
cannot be undone. While the delete runs the confirmation stays up with its buttons locked: the
confirm button would otherwise close the dialog in the same click, leaving the menu free to start a
second delete over the first.

The order is the reverse of an edit: the server is asked first, and the tile leaves the rail only
once it has agreed (`PlaceRepository.deletePlace`). Removing the tile first would be wrong for the
place the session is in. The home page moves the session to another place as soon as the selected
one is missing from the list, and a refusal that then put the tile back would not bring the session
back with it. A refusal says so in a toast, by kind, and the tile never moved.

When the deleted place is the one the session was in, that same move takes over (`placeToEnter`):
the place last used in this cloud if it is still there, otherwise the first one. When it was the
cloud's last place there is nowhere to move, and the session still names the deleted place. The home
page stops reading that name once the list is empty, so the cloud's direct messages are shown, as
for any cloud with no place, rather than the deleted place's cached channels.

The menu is locked while a switch is in flight, with the tiles, since deleting the current place
ends in a switch of its own. The confirmation is withdrawn when its place leaves the list, as a
cloud change makes it: the id it holds belongs to the cloud it was opened in.
