# Onboarding

The two-card welcome (`OnboardingDialog`, mounted by `HomePage`): a welcome, then a few tips before
the first message. Settings reopens it on demand.

## Once per account

The dialog opens on the first landing of an account that has not closed it, and any close (Done, X,
Escape, an overlay click) marks it seen in `localStorage`, so a reload does not bring it back.

The flag is keyed by the account's relay uid, not the session's uid. Every cloud gives the account a
different uid, and the session answers with the one for the cloud it is in, so a flag keyed by it
opened the tips again on the first visit to each workspace. The relay uid is the same in every cloud.
Another account signing in on the same device still gets its own first run.

## The Self Channel row

On Home the first card shows whether the account's Self Channel has arrived, because a new account
lands there before its channel list has loaded. The row spins until the channel is in the list, then
says it is ready. After 15 seconds without it the row says the channel could not be loaded and
offers a retry, which runs a full channel sync and starts the wait again. Elsewhere the row is not
rendered: there is nothing to wait for.

## Tips that match what the account has

The second card explains the workspace and place columns only when the account has a workspace
beyond Home. An account with Home alone (a new guest, most often) has neither to pick, so that tip is
replaced by how to join one: the profile menu's "Join with invite". The tip names the menu item
through its own string, so renaming the item renames the tip.

Closing the dialog hands focus to the room's message box; see [keyboard.md](./keyboard.md).

## The place welcome page

A place of a workspace cloud with nothing in it yet (no channel and no 1:1, my notes-to-self room
aside) opens Home on a welcome page in the main pane, `WelcomePage`, instead of an empty room. The
dialog above is once per account; this page is about one place, and it stays until the place has a
conversation or the reader puts it away with Later. The default cloud never shows it: its first run is
the dialog and the Self Channel.

The landing still selects the notes-to-self room underneath, since every place lists one; that
selection does not hide the page. A room the reader opens does — from the sidebar, a saved item, a
notification, a return to where the reader was, or a deferred jump into this place — and the page
comes back on the next visit to the place. The mark lives in the Home screen, so leaving Home for
profile or settings and coming back also counts as a new visit.

Four steps follow the welcome, each opening the flow that does it: Create a channel, Invite members
(the place invite), Send a DM (where this cloud can start one) and Set up your profile (the place
profile editor). Their progress is derived, not recorded — `usePlaceWelcome` reads it from what the app
already holds:

- **Channel** — I own one of the place's channels.
- **Invite** — an invite into the place went out from this device. The server lists no sent invites
  back, so `SendInviteDialog` marks it on success (a channel invite counts for the open place).
- **DM** — the place has a 1:1 with someone else.
- **Profile** — my profile in this place has a nick or a photo.

A channel or a 1:1 also ends the page, so those two steps read done only for the moment before it
gives way to the room. Later and the invite mark are kept on this device, per person and per place
(`useWelcomeStore`): putting the page away in one place says nothing about the next, and another
account on the same device gets its own.
