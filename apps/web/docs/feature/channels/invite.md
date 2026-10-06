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

Two pages (the tab shell and the link page), five components (the place tab, the contact tab
`ContactInviteTab`, the add-friend sheet, the link view `InviteLinkView`, the permission banner), and
one pure module — `deviceContact.ts` for the name and phone chains, the second line, the sort order
and the search text. Numbers are read with the shared `utils/phoneNumber.ts`, the same module the
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

The two tabs share nothing but the 100-person cap — not the selection, not the confirm button. Place
adds people immediately; contact issues links. One button that did either depending on a tab would
be two buttons wearing one label.

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

Selection caps at 100 with a toast. Confirming sends **one** recipient as a single invite (a text to
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
