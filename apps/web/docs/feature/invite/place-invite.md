# place-invite — inviting someone into a cloud place, with no room

The owner of a cloud place can bring someone into the place before there is a room to put them in.
The entry is **"Invite to place"** in the home header's profile dropdown, under "Place settings". It
opens `/invite/place/:placeId` (`pages/PlaceInvitePage.tsx`). Accepting the invite lands the
recipient in that place with no room.

## Same screens as the room invite

It is the group room's contact invite, bound to the place instead of a room. The two share their
parts rather than copies of them — all in `features/channels`, where the room invite lives:

| Part                          | What it is                                                               | Room invite binds it to     | Place invite binds it to      |
| ----------------------------- | ------------------------------------------------------------------------ | --------------------------- | ----------------------------- |
| `components/ContactInviteTab` | device-contact picker, its permission states, the web guide, the confirm | its "contacts" tab          | the whole page                |
| `components/AddFriendSheet`   | name-and-number sheet that issues one invite and hands back its link     | `/channels/:id/invite/link` | `/invite/place/:placeId/link` |
| `components/InviteLinkView`   | the link card, copy and share                                            | the room's name and picture | the place's name and picture  |

So the flow is the room invite's. On the app: pick contacts; **one** goes out as a text from the SMS
composer, **several** as `user.invite-batch`, which the server texts itself. On the web, or past the
list: the link sheet, then the link page. The place differs only in copy — the SMS body
(`placeInvite.smsMessage`), the sheet heading and the web guide name the place, not a chat room — and
in that nothing it sends names a room.

## What goes on the wire

Every send goes through `useCreateInviteBatch` — `createPlaceInvite` for one contact,
`createBatchInvite` for several, `requestInviteLink` for the sheet — with **no `channelId` key**, not
`channelId: undefined`: the server reads a missing room as "the place alone".

What the server does with it was measured on the dev servers:

- **The invite is filed under the site the session is on.** The packet has no site field. The
  response carries `siteId`/`site$` for the session's site, `channelId: ""`, and the cloud's
  `cloudId`/`cloudName`.
- **The recipient becomes a member when the invite is issued.** The response already names their
  cloud `userId`, and their `<uid>@<sid>` role row dates from the moment of issue, not the moment of
  acceptance.
- **Accepting needs nothing new.** `auth.switch` into that role succeeds, `user.my-site` lists the
  place with `isOwner: false`, and no place profile is required.

`user.invite-batch { to }` with no room was measured the same way. It files every number under the
session's site too, writes a user and a member role per number at issue, and a clean guest accepting
one lands in the place alone. Three differences from `user.invite`: a batch row carries **no
`channelId` key at all** (not `""`, which the accept screen reads the same), its `name` is the phone
number — the batch has no names, so that is what the new member is called until they set a profile —
and it expires in **three days**, where a single invite asks for and gets one. What the server's own
text says is not visible from the client.

## Who sees the entry, and when it works

`app/utils/placeInviteGate.ts` is the one rule, shared by the menu entry and the page — it lives
outside both features because both read it. The two must never disagree about the same place.

| Gate       | When                                                                                                                                                            | Menu entry   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `hidden`   | relay (its single place has no owner), a guest, or a place row without `isOwner: true` — a row not loaded yet included, because `isOwner` is the only authority | not rendered |
| `disabled` | a place switch in flight, or the place on screen and the session's place disagree                                                                               | greyed out   |
| `ready`    | the owner, with the session on that place                                                                                                                       | enabled      |

The session decides because the server stamps the session's site on the invite. For the same reason
the page re-reads the gate **on every send** — the contact confirm and the link sheet alike — not
only when it renders. Another tab or a push can move the session while the page is open. Sending then
would invite people into a place the screen never named, so the send throws
`placeInvite.placeChanged`, which the contact tab and the sheet toast as they would any failure. A
direct visit whose gate resolves to `hidden` is sent home, the same backstop the place edit screen
keeps for non-owners.

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
npx jest --config apps/web/jest.config.js --testPathPatterns "PlaceInvite|placeInviteGate|resolveCloudInviteTargetKind|InviteAcceptScreen|useCreateInviteBatch|InvitePage|AddFriendSheet|HomePage"
```

End to end on the web it needs two sessions that do not share storage. On a local dev server:

1. Sign in as the owner of a cloud place at `localhost`, and make that place active.
2. Open the invite from the profile menu, send a link from the sheet, and land on the link page.
3. Open the link at `[::1]` (another origin, so another guest) and accept.
4. Check that home shows the place as invited, with no rooms.

The contact picker and the SMS composer need the app on a device or simulator; the browser only
reaches the link path.
