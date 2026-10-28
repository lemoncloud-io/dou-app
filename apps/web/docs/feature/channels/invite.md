# invite — putting somebody into an existing channel

Two screens, `/channels/:channelId/invite` and `/channels/:channelId/invite/link`, reached from the
room's empty-state button and the settings screen's "add friend" row. Both entry points are already
gated to a group room's owner, so the page itself never re-checks permission per tab.

The page holds **two different acts under one title**:

| Tab                 | Who it adds                                     | How                           | Result                         |
| ------------------- | ----------------------------------------------- | ----------------------------- | ------------------------------ |
| **Place** (default) | somebody who is already a member of this place  | `channel.invite`              | they are in the room at once   |
| Contact             | somebody with no account, or outside this cloud | `user.invite-batch` or a link | they receive a link and accept |

Place is the default because most people worth adding are already here, and because on the web the
contact tab has nothing to offer but the link prompt — a browser has no device contacts.

Issuing a **relay 1:1** invite is a different flow living in another feature —
[../invite/README.md](../invite/README.md) — and re-inviting a departed 1:1 peer hands off to it
with a channel id. What is described here is only the group case.

## Layout

Two pages (the tab shell and the link page), five components (the place tab, the contact tab
`ContactInviteTab`, the add-friend sheet, the link view `InviteLinkView`, the permission banner), and
one pure module — `deviceContact.ts` for the name and phone chains, the second line, the sort order
and the search text. Numbers are read with `@chatic/shared/phone`, the same module the
relay invite's field uses ([auth/international-phone-input.md](../auth/international-phone-input.md)).
The pickers, the search input and the link card are `@chatic/web-ui-kit`.

**The contact tab, the sheet and the link view are also the place invite's**
([invite/place-invite.md](../invite/place-invite.md)), which binds them to a place instead of a room.
So none of the three names a channel: the tab is handed `sendSingle`/`sendBatch`, the sheet
`requestLink`/`onLinkReady`, and the view a name, a picture and `onClose` — the pages here bind them
to `channelId` and to `roomDistance`. The contact tab stays mounted while the place tab is showing
(`active={false}` renders nothing), which is what keeps its contacts and selection across a switch.

## The tab shell

One route, two subtrees. The tab is **not** in the URL: nothing deep-links to a specific tab, and
putting it there would make the back button undo a tab switch, which reads as leaving the page.

The two tabs share nothing but the room's cap — not the selection, not the confirm button. Place
adds people immediately; contact issues links. One button that did either depending on a tab would
be two buttons wearing one label.

**The cap is the room's: 100 members in all.** One invite picks at most `100 − memberCount` — the
seats still free (`MAX_ROOM_MEMBERS` in `InvitePage`). A new group with no members counted offers all
100; a full room offers none. A pick past the cap is refused and explained with
`chat.settings.memberLimit` in an alert, through the tabs' `onLimitReached`; without that prop a tab
toasts its own batch-cap line, which is what the place invite page still does. People invited by
contact who have not joined yet are not counted — nothing on the client can see them.

**Contacts are only requested once the contact tab has been opened.** `appBridge.getContacts()`
raises the OS permission prompt, so calling it on mount would ask people who never intended to use
it. The trigger is a latch — "has this tab ever been opened" — not the tab's current value: keying
the effect on the value means switching back runs the cleanup, which cancels an in-flight request
while the re-request guard stays set, and the contact tab is then blank forever.

The request waits **60 seconds**, not the bridge's 15-second default. On first use the OS prompt is
raised inside this same request, so the clock also runs while somebody reads it — and the bridge
drops an answer that arrives after its timeout. At 15 seconds, a person who took a while to tap
"Allow" was shown the permission-denied banner for a list that had in fact been granted.

## The place tab

`useInviteCandidates(channelId, sid)` answers who can be added: **the members of the room's place,
minus the target's members and me**. The members come from the server's place member list
(`place.list-user`, through `userRepository.listPlaceMembers`), which counts everyone the place has
given a role to, plus its owner. So two kinds of people the owner could not reach before are
offered: somebody with no room at all — invited into the place only, whether or not they have
accepted yet — and somebody whose rooms are all ones the owner is not in. A person whose invite is
not yet accepted is not marked apart: the server has nothing to tell them by, and being able to put
them straight into a room is the point.

The list is read page by page and asked for each time the tab opens; it is not cached. A page can
come back shorter than asked for (the server drops members who left after cutting the page), so the
end is an empty page or reaching the answer's `total`, never a short page.

"Me" is my id in the selected cloud (`useUidInCloud`) and the session's user id both — the list names
me by the first, older paths by the second. The target's members are excluded from two independent
sources: the room row's `memberIds` and the room's roster as the user cache holds it. Either alone
covers the happy path; both together mean a row that arrived without `memberIds` cannot offer
somebody already there.

**The fallback is the previous pool** — every member of my _other_ rooms in this place, a pure
derivation over `useHomeChannels(sid)` (a slice of the app's single cloud-wide channel observation,
where each row already carries `memberIds`) that issues no requests. It is used when the list fails —
`403` to somebody who is not a member, or a cloud whose server does not have the action yet — and
while the socket is not verified, so a wedged connection still shows the people the cache knows. It
holds only people I already share a room with, so it can never show anyone I could not see anyway.
**The two pools are never mixed**: either the list stands alone or the fallback does. While a
verified list is still in flight the tab shows nothing rather than flashing the fallback first.

Rows are drawn with the person's **place profile** first, through the same machinery the room's
member list uses — observe the site's profiles, one-shot the ones the cache is missing — so somebody
picked here reads exactly as they will in the member list. The list warms that cache itself: each
page's ids go to `profile.sync` with `userIds`, and the answer is stored the way the background
profile sync stores its own. That only happens when the session is on the room's place and no switch
is in flight, because `profile.sync` answers for the session's place and the rows are filed under
the place the caller names — asking from another place would file that place's profiles here. When
it is skipped, the one-shot per missing candidate still runs. This by-id load never touches the
background sync's cursor: it is sent without `since`, and its `syncedAt` is not kept.

The name chain is `profile nick → user-record nick/name → label`. The middle rung is the user cache
read per id (`cacheRead`, since `observeList` for users needs a `channelId`), and, for a member the
user cache has never seen, the list's own row — the user's account name. Where both exist the
cached row wins, as it always did. The avatar is the place profile's picture, else the user's own
picture from the list (the server calls it `photo`; the data layer moves it to `thumbnail`). Search
matches the shown name and the id, so pasting an id still finds someone whose nick you do not know.

For a pool from the place list the tab registers **no per-person profile work**: the list loaded the
profiles a page at a time, and a bootstrap plus a poll per person would be one request per member of
the place. It only observes the place's profile cache. For the fallback pool the old behaviour
holds — one sync target per candidate on the **list** cadence (`LIST_PROFILE_SYNC_INTERVAL_MS`, 60s),
not the room's 20s, with a one-shot read for each candidate the cache is missing.

The list is held until the channel rows are in: the target's `memberIds` arrive with them, and a list
that showed first would offer people already in the room. The target's roster, the second exclusion,
is read from the user cache only — unlike desktop, which refreshes it alongside the list; the web
issues no roster requests on either path.

Confirming calls `inviteChannel({ channelId, userIds })` once. The repository owns the optimistic
membership write and its rollback, so the screen only reports the outcome, and the settings list
behind it shows the new members immediately — `channel.memberIds` is what seeds that list, and the
names come from profiles the picker has already cached.

With no candidates — everybody is already here, or, on the fallback, no other rooms — the tab says
so and points at the contact tab.

## The contact tab

Native only, in substance. `getContacts()` returns the device's contacts together with whether the
read was allowed (`granted` or `denied`); anything without a valid mobile number is
`disabled` rather than hidden, because "saved but not shown" and "cannot be invited" are different
statements to a reader.

The app reads **without photos**. With them, iOS writes a PNG into its cache for every contact that
has one, and the web has nothing to show them with: the row reads names, company, job title and
numbers, and no other field.

Seven rules govern how a contact becomes a row. The functions behind them live in
[`deviceContact.ts`](../../../src/app/features/channels/utils/deviceContact.ts); the page applies
them — the filter of rule 4, the sort of rule 5 and the pinning of selected rows.

1. **The app normalises, the web names.** Nothing in a contact record is mandatory and the two
   platforms express emptiness differently — Android fills `displayName` from the organisation,
   iOS omits the key entirely; iOS never fetches the nickname field at all. The mobile app fills
   missing keys with defaults so the declared types hold; choosing which fragment leads is a
   presentation rule and belongs here.
2. **The name chain is** `displayName` → assembled name parts → `company` → **the phone number** →
   a label. The number is a real answer, not filler: it is what the person will be called on, and
   it is how a reader recognises the row. Name parts join without spaces when the script is
   Korean, Han or kana, and with spaces otherwise.
3. **Every stored number is scanned**, not just the first, and the first valid mobile wins.
   Contact apps do not order numbers, so reading only slot one treated anyone with a home number
   first as having none. A number saved with a `+` is read in the country it names; one saved
   without is read as Korean, then as the device locale's country — Korea first so that no number
   invitable before international support reads any differently, the locale second because a
   local number is local to whoever saved it. The phone field's last picked country is not a guess
   here: it names the last person invited by hand, not the owner's address book. Mobile only, since
   every invite is a text. The invite carries the number as E.164 (`+821012345678`); a Korean
   mobile is shown as dialled at home (`010-1234-5678`), any other with its country code
   (`+1 415 555 0123`) so the row says which country the text will go to. A number Korea took that
   the locale's country would also have taken — `0171 2345678` on a German device — is still invited
   as Korean, but shown with its `+82` so the guess is visible. The search text holds the shown
   form, the number's national form (what the owner typed when saving it) and the digits of both.
4. **A contact with no number at all is dropped from the list**, using the _same_ function that
   builds the displayed number — "nothing to show" and "not listed" must not disagree. An invite
   goes out by number, so such a row could neither be invited nor recognised. If that empties the
   list, the screen says why rather than rendering a blank panel; search and the link invite stay.
   The final unnamed label of rule 2 is therefore unreachable in practice — this rule removes
   exactly the contacts that would reach it. It stays so that an empty row, the bug the chain
   exists to remove, would read as a deliberate label rather than a failure.
5. **Rows are sorted by the label they show**, in phone-book blocks: Hangul, then Latin, then other
   scripts, then labels that start with a digit or a symbol. Latin means the script, accents
   included, and labels are compared after NFC normalisation. Neither platform sorts — iOS fetches
   with no sort order, Android reads rows in storage order — so without this the same address book
   listed in two orders. A plain `localeCompare('ko')` is not enough: it puts digits first, and a
   contact labelled by its number would lead the list. Selected rows stay pinned on top.
6. **A row's second line is the shown number, then company and job title**, leaving out whichever
   of them is already the row's label — a number is compared by its digits, because Android labels
   a number-only contact with the number exactly as stored. A name alone could not tell two people
   with the same name apart, and the row never said which number an invite would reach. It uses
   only fields both platforms send — iOS has no department, nickname or starred flag, and notes
   need an Apple entitlement the app does not hold.
7. **Search matches what is on screen**: the label (including the name composed from parts, which
   is all iOS has), the second line's company and job title, and the number with and without
   dashes. Before the composed name was added, typing `김민수` on iPhone found nothing, because the
   parts alone join to `민수 김`.

Above the list sits a count of the rows it holds — `연락처 N명`, or `검색 결과 N명` while
searching. It counts listed contacts, so the ones rule 4 drops are not in it, and while searching it
counts matches only: a selected row pinned on top without matching is not a result.

Selection caps at the seats the room has left ([the tab shell](#the-tab-shell)). Confirming sends **one** recipient as a single invite (a text to
that number, or the clipboard on web — the toast says which actually happened) and **several** as a
batch the server fans out over SMS itself.

When permission is refused, `PermissionDeniedBanner` explains and offers `appBridge.openSettings()`.
The page believes the permission the app reports, so a granted but empty address book shows the
empty-list message rather than the banner. An app built before that field existed reports nothing,
and then the page falls back to what such an app does on a refusal: Android answers with an empty
list, iOS with a failed request. Both still land on the banner — and so does a request that times
out, which a current app only produces when something is actually broken.

**Partial contact access** arrives as `granted` and lists what the OS returned; neither the list nor
the permission says it is partial. The app cannot tell: the contacts library's status call never
settles on iOS 18 while access is partial or not yet decided, so the iOS app never makes it and
reads a refusal from the failed read instead (the reasoning is in
[`apps/mobile/docs/webview`](../../../../mobile/docs/webview/README.md)). A person who grants partial
access and picks nobody therefore sees the empty-list message, not the banner. The way out of a
short list is the search bar's link icon: a name and a number typed there reach somebody the picker
never showed. The OS settings route stays on the banner.

## The invite link

The search bar's link icon (native), the web guide and the permission banner all open
`AddFriendSheet`: a name, a country and a mobile number. The country opens on the last explicit
pick, else the device locale's region, else Korea — most invitees are Korean, and a region-less
locale (`ko`) must not make the common case start with "pick a country". A pasted `+81…` moves the
picker to its own country, and invisible bidi marks a copied number can carry are dropped. The
number is validated as a mobile of that country and sent as E.164. Submitting calls the page's
`requestLink` — here `requestInvite` for this room — and takes the `Location` from the response
**without sharing it**; the page's `onLinkReady` then navigates to `InviteLinkPage` with the link in
route state.

There is no general "channel invite link" endpoint, which is why a name and a number always come
first: the link only exists as the answer to an issued invite.

`InviteLinkPage` shows the room's name and the full URL in an `InviteLinkCard`, copies on the link
icon, and shares through the OS sheet (native) or the clipboard (web). After sharing the button
reads "shared" — a second tap means done, so it pops the whole invite flow back to the room rather
than re-sharing. Losing the route state (a reload) redirects to the room, since there is nothing
left to show.

Both pages carry `roomDistance` through navigation state so the final step can pop the entire flow
at once instead of leaving the settings and invite entries stacked underneath.

## What not to do

- **Do not fetch a roster per channel to build the candidate pool.** The place list is the pool;
  the fallback is built from the `memberIds` the cache already holds for every row the home
  observation covers.
- **Do not merge the place list with the roster union.** The union is the failure fallback only.
- **Do not call `profile.sync` with `userIds` from a place the session is not on**, and do not store
  its `syncedAt` as the background sync's cursor — the first files profiles under the wrong place,
  the second makes the background sync skip changes to my rooms' members.
- **Do not call `getContacts()` on mount**, and do not key its effect on the tab's current value.
- **Do not name a candidate from the channel row.** Names come from the place profile, or the
  picker and the member list will disagree about the same person.
- **Do not share the link from the sheet.** The sheet acquires it; the link page presents it.
- **Do not add somebody to a 1:1.** A 1:1 is a fixed pairing, and the entry points are gated so the
  page never sees one.

## Notes for implementers and tests

- The place tab's real round trip needs two accounts, so it is covered by unit tests rather than a
  browser check: `useInviteCandidates.test.ts` (the place list — members with no room and members
  sharing none with me, both exclusions, me under either id, the 403 fallback, an answer for another
  place, a switch in flight, the loading state, the unverified path — and the fallback union, rows
  without `memberIds`, no ids, no user id) and `PlaceInviteTab.test.tsx` (the name fallback including
  the list's row, the avatar fallback, selection and the cap, search, one `inviteChannel` call,
  success and failure paths, the empty and loading states). Paging, the profile load and its
  session-place check are `UserRepository.test.ts` and `ProfileRepository.test.ts` in `libs/data`.
- `InvitePage.test.tsx` covers the tab shell — place is the default, contacts are not requested
  while it stays there, they are requested once on entering the contact tab and not again, and a
  response that arrives after switching back still lands.
- `InvitePage.test.tsx` also covers the reported permission (granted-and-empty, denied, and an
  older app that reports none), the sort order, the second line and the count.
- `deviceContact.test.ts` holds the name chain, the phone matrix, the second line, the sort
  comparator and the search text; `contactInfo.test.ts` in `apps/mobile` holds the normalisation on
  the other side of the bridge, and `DeviceService.test.ts` the permission each platform reports.

```bash
npx jest --config apps/web/jest.config.js --runInBand --watchman=false apps/web/src/app/features/channels
```

## Further reading

- [channel-settings.md](./channel-settings.md) — the "add friend" row this page opens from.
- [chat-room.md](./chat-room.md) — the empty-room invite button, the other entry point.
- [../invite/README.md](../invite/README.md) — relay 1:1 invites, and the re-invite form a DM hands off to.
