# invite — putting somebody into an existing channel

Two screens, `/channels/:channelId/invite` and `/channels/:channelId/invite/link`, reached from the
room's empty-state button and the settings screen's "add friend" row. Both entry points are already
gated to a group room's owner, so the page itself never re-checks permission per tab.

The page holds **two different acts under one title**:

| Tab                 | Who it adds                                           | How                           | Result                         |
| ------------------- | ----------------------------------------------------- | ----------------------------- | ------------------------------ |
| **Place** (default) | somebody already sharing a room with me in this place | `channel.invite`              | they are in the room at once   |
| Contact             | somebody with no account, or outside this cloud       | `user.invite-batch` or a link | they receive a link and accept |

Place is the default because most people worth adding are already here, and because on the web the
contact tab has nothing to offer but the link prompt — a browser has no device contacts.

Issuing a **relay 1:1** invite is a different flow living in another feature —
[../invite/README.md](../invite/README.md) — and re-inviting a departed 1:1 peer hands off to it
with a channel id. What is described here is only the group case.

## Layout

```text
pages/
├── InvitePage.tsx           the tab shell, the contact tab, the batch invite
└── InviteLinkPage.tsx       the issued link: card, copy, share
components/
├── PlaceInviteTab.tsx       the place tab: candidates, selection, channel.invite
├── AddFriendSheet.tsx       name + phone, exchanged for a link
└── PermissionDeniedBanner.tsx  contacts permission is off
hooks/
├── useInviteCandidates.ts   who can be added, derived from cache
├── useCreateInviteBatch.ts  single / batch / link-only issue
└── useUserMutations.ts      the repository calls underneath
utils/
├── deviceContact.ts         contact name, phone and search text
└── koreanPhone.ts           validation and formatting for the sheet
```

`SegmentedTabs`, `SelectableUserItem`, `SelectedAvatarRow`, `SearchInput` and `InviteLinkCard` are
`@chatic/web-ui-kit` components.

## The tab shell

One route, two subtrees. The tab is **not** in the URL: nothing deep-links to a specific tab, and
putting it there would make the back button undo a tab switch, which reads as leaving the page.

The two tabs share nothing but the 100-person cap — not the selection, not the confirm button. Place
adds people immediately; contact issues links. One button that did either depending on a tab would
be two buttons wearing one label.

**Contacts are only requested once the contact tab has been opened.** `appBridge.getContacts()`
raises the OS permission prompt, so calling it on mount would ask people who never intended to use
it. The trigger is a latch — "has this tab ever been opened" — not the tab's current value: keying
the effect on the value means switching back runs the cleanup, which cancels an in-flight request
while the re-request guard stays set, and the contact tab is then blank forever.

## The place tab

`useInviteCandidates(channelId, sid)` answers who can be added: **every member of my other channels
in this place, minus the target's members and me**. It issues no requests at all —
`useHomeChannels(sid)` is a slice of the app's single cloud-wide channel observation and each row
already carries `memberIds`, so the union is a pure derivation over data the screen holds anyway.
There is no user-directory API to ask instead: every listing action the server has is scoped to one
channel.

Two independent exclusions keep an existing member out of the pool — the target channel is skipped
while unioning, _and_ the target's `memberIds` are subtracted afterwards. Either alone suffices in
the happy path; both together mean a channel row that arrived without `memberIds` cannot leak its
members back in as candidates. A row missing that field contributes nothing rather than guessing.

The hook returns **ids only**. Rows are drawn with the person's **place profile**, through the same
machinery the room's member list uses — observe the site's profiles, one-shot the ones the cache is
missing — so somebody picked here reads exactly as they will in the member list. The name chain is
`profile nick → user-record name → userId`, with the middle rung read through a per-id `cacheRead`
rather than an observer, because `observeList` for users requires a `channelId` and these candidates
come from many channels. Search matches all three, so pasting an id still finds someone whose nick
you do not know.

Profiles here poll on the **list** cadence (`LIST_PROFILE_SYNC_INTERVAL_MS`, 60s), not the room's
20s: one sync target is registered per candidate and this pool is the union across every room I am
in. A nick changing mid-selection does not matter, and first paint comes from the bootstrap anyway.

Confirming calls `inviteChannel({ channelId, userIds })` once. The repository owns the optimistic
membership write and its rollback, so the screen only reports the outcome, and the settings list
behind it shows the new members immediately — `channel.memberIds` is what seeds that list, and the
names come from profiles the picker has already cached.

With no candidates — no other rooms, or everybody is already here — the tab says so and points at
the contact tab.

## The contact tab

Native only, in substance. `getContacts()` returns the device's contacts; anything without a valid
Korean mobile number is `disabled` rather than hidden, because "saved but not shown" and "cannot be
invited" are different statements to a reader.

Four rules govern how a contact becomes a row, all in
[`deviceContact.ts`](../../../src/app/features/channels/utils/deviceContact.ts):

1. **The app normalises, the web names.** Nothing in a contact record is mandatory and the two
   platforms express emptiness differently — Android fills `displayName` from the organisation,
   iOS omits the key entirely; iOS never fetches the nickname field at all. The mobile app fills
   missing keys with defaults so the declared types hold; choosing which fragment leads is a
   presentation rule and belongs here.
2. **The name chain is** `displayName` → assembled name parts → `company` → **the phone number** →
   a label. The number is a real answer, not filler: it is what the person will be called on, and
   it is how a reader recognises the row. Name parts join without spaces when the script is
   Korean, Han or kana, and with spaces otherwise.
3. **Every stored number is scanned**, not just the first, and the first valid Korean mobile wins.
   Contact apps do not order numbers, so reading only slot one treated anyone with a home number
   first as having none.
4. **A contact with no number at all is dropped from the list**, using the _same_ function that
   builds the displayed number — "nothing to show" and "not listed" must not disagree. An invite
   goes out by number, so such a row could neither be invited nor recognised. If that empties the
   list, the screen says why rather than rendering a blank panel; search and the link invite stay.

The final unnamed label is therefore unreachable in practice — rule 4 removes exactly the contacts
that would reach it. It stays so that an empty row, the bug this chain exists to remove, would read
as a deliberate label rather than a failure.

Selection caps at 100 with a toast. Confirming sends **one** recipient as a single invite (a text to
that number, or the clipboard on web — the toast says which actually happened) and **several** as a
batch the server fans out over SMS itself.

When permission is refused, `PermissionDeniedBanner` explains and offers `appBridge.openSettings()`.
The settings button stays visible even with a populated list, because **partial contact access**
returns a truncated list without saying so — the user cannot tell, and that button is the only way
out.

## The invite link

The search bar's link icon (native), the web guide and the permission banner all open
`AddFriendSheet`: a name and a Korean phone number. Submitting calls `requestInvite` and takes the
`Location` from the response **without sharing it**, then navigates to `InviteLinkPage` with the
link in route state.

There is no general "channel invite link" endpoint, which is why a name and a number always come
first: the link only exists as the answer to an issued invite.

`InviteLinkPage` shows the room's name and the full URL in an `InviteLinkCard`, copies on the link
icon, and shares through the OS sheet (native) or the clipboard (web). After sharing the button
reads "shared" — a second tap means done, so it pops the whole invite flow back to the room rather
than re-sharing. Losing the route state (a reload) redirects to the room, since there is nothing
left to show.

Both pages carry `roomDistance` through navigation state so the final step can pop the entire flow
at once instead of leaving the settings and invite entries stacked underneath.

## Scenarios

1. **Add someone already in the place.** Open from settings, land on the place tab, pick from the
   candidates, confirm — one `channel.invite`, a toast, back to settings with the new member listed.
2. **Nobody to add.** The tab explains and points at the contact tab.
3. **Invite from contacts.** Open the contact tab (permission is requested here, not before), pick
   up to 100 rows with a valid number, confirm — one invite or a server-side batch.
4. **Permission off.** The banner offers the OS settings and the link invite.
5. **Invite by link.** Name and number in the sheet, then the link page: copy, or share, then back
   to the room.
6. **On the web.** The place tab opens with something to choose from; switching to contacts gives
   the link prompt, since a browser has no contacts to read.

## What not to do

- **Do not fetch a roster per channel to build the candidate pool.** The cache already holds
  `memberIds` for every row the home observation covers.
- **Do not call `getContacts()` on mount**, and do not key its effect on the tab's current value.
- **Do not name a candidate from the channel row.** Names come from the place profile, or the
  picker and the member list will disagree about the same person.
- **Do not share the link from the sheet.** The sheet acquires it; the link page presents it.
- **Do not add somebody to a 1:1.** A 1:1 is a fixed pairing, and the entry points are gated so the
  page never sees one.

## Notes for implementers and tests

- The place tab's real round trip needs two accounts, so it is covered by unit tests rather than a
  browser check: `useInviteCandidates.test.ts` (the union, both exclusions, rows without
  `memberIds`, no ids, no user id) and `PlaceInviteTab.test.tsx` (the three-rung name fallback,
  selection and the cap, search, one `inviteChannel` call, success and failure paths, the empty and
  loading states).
- `InvitePage.test.tsx` covers the tab shell — place is the default, contacts are not requested
  while it stays there, they are requested once on entering the contact tab and not again, and a
  response that arrives after switching back still lands.
- `deviceContact.test.ts` holds the name chain and the phone matrix; `contactInfo.test.ts` in
  `apps/mobile` holds the normalisation on the other side of the bridge.

```bash
npx jest --config apps/web/jest.config.js --runInBand --watchman=false apps/web/src/app/features/channels
```

## Further reading

- [channel-settings.md](./channel-settings.md) — the "add friend" row this page opens from.
- [chat-room.md](./chat-room.md) — the empty-room invite button, the other entry point.
- [../invite/README.md](../invite/README.md) — relay 1:1 invites, and the re-invite form a DM hands off to.
