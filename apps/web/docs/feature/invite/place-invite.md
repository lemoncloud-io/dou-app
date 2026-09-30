# place-invite — inviting someone into a cloud place, with no room

The owner of a cloud place can bring someone into the place before there is a room to put them in.
The entry is **"Invite to place"** in the home header's profile dropdown, under "Place settings". It
opens `/invite/place/:placeId` (`pages/PlaceInvitePage.tsx`). Accepting the invite lands the
recipient in that place with no room.

## What goes on the wire

The form sends `user.invite { name, phone }` through `useCreateInviteBatch.createPlaceInvite`.
`channelId` is **absent**, not `undefined`: the server reads a missing room as "place only". The
phone is E.164, as on the relay contact form, so one country picker serves both forms. The returned
`Location` link goes to the SMS composer on the app and to the clipboard on the web
(`sendInviteMessage`), the same hand-off the room invite uses. The SMS body is
`placeInvite.smsMessage`, which names the place. The room invite's copy promises a chat the
recipient will not get.

What the server does with it was measured on the dev servers:

- **The invite is filed under the site the session is on.** The packet has no site field. The
  response carries `siteId`/`site$` for the session's site, `channelId: ""`, and the cloud's
  `cloudId`/`cloudName`.
- **The recipient becomes a member when the invite is issued.** The response already names their
  cloud `userId`, and their `<uid>@<sid>` role row dates from the moment of issue, not the moment of
  acceptance.
- **Accepting needs nothing new.** `auth.switch` into that role succeeds, `user.my-site` lists the
  place with `isOwner: false`, and no place profile is required.

## Who sees the entry, and when it works

`app/utils/placeInviteGate.ts` is the one rule, shared by the menu entry and the form — it lives
outside both features because both read it. The two must never
disagree about the same place.

| Gate       | When                                                                                                                                                            | Menu entry   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `hidden`   | relay (its single place has no owner), a guest, or a place row without `isOwner: true` — a row not loaded yet included, because `isOwner` is the only authority | not rendered |
| `disabled` | a place switch in flight, or the place on screen and the session's place disagree                                                                               | greyed out   |
| `ready`    | the owner, with the session on that place                                                                                                                       | enabled      |

The session decides because the server stamps the session's site on the invite. For the same reason
the form re-reads the gate **when the user submits**, not only when it renders. Another tab or a push
can move the session while the form is open. Sending then would invite the person into a place the
screen never named, so the form refuses with `placeInvite.placeChanged`. A direct visit whose gate
resolves to `hidden` is sent home, the same backstop the place edit screen keeps for non-owners.

There is one recipient per submission. `user.invite-batch` would also take a missing `channelId`,
but every issued invite leaves a member row (above) and this lane has no way to cancel one, so the
surface stays as small as it can be.

## On the recipient's side

The accept pipeline is unchanged — login with the code, enter the cloud, enter `info.siteId`, and
enter the room only if there is one (`useEnterInvitedChannel` skips that step when there is not).
What changed is the target card. `CloudInviteAccept` reads an empty `channelId` in the invite
metadata as the `place` kind (`accept/lib/resolveCloudInviteTargetKind.ts`), captioned "Place
member", with no room member count. Until the metadata arrives it keeps the group default.

Home then shows the place with the invited empty state ("You're not in any chat room yet"), the
state `ChannelEmptyState variant="invited"` already drew.

## What this does not solve

- **The owner cannot find the person afterwards.** There is no place member list. Member pickers are
  built from the rosters of rooms the owner shares with people, so someone who is only in the place
  appears in none of them until they join a room some other way. Closing this needs a place member
  listing from the backend.
- **An unaccepted invite cannot be taken back.** The member row exists from the moment of issue, and
  the cloud invite lane has neither a list of sent invites nor a cancel.
- **The recipient cannot leave.** The empty state says they can, and the place settings hub has no
  leave action yet.

## How to verify

```bash
npx jest --config apps/web/jest.config.js --testPathPatterns "PlaceInvitePage|placeInviteGate|resolveCloudInviteTargetKind|InviteAcceptScreen|useCreateInviteBatch|HomePage"
```

End to end it needs two sessions that do not share storage. On a local dev server:

1. Sign in as the owner of a cloud place at `localhost`, and make that place active.
2. Send the invite from the profile menu. On the web the link lands on the clipboard.
3. Open the link at `[::1]` (another origin, so another guest) and accept.
4. Check that home shows the place as invited, with no rooms.
