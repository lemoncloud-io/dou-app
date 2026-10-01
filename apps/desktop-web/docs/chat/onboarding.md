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
