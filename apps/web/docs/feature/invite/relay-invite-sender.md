# relay-invite-sender — the inviter's lane

Two screens and one rule. `ContactInvitePage` turns a name and a phone number into a relay invite
and hands the link to the SMS composer; `InviteWaitingPage` watches that invite until it becomes a
room, lapses, or is retired. The rule underneath both is that **one phone number never has two live
codes**, and most of this document is the consequences of enforcing it.

See [README](./README.md) for the folder map and the rules both lanes share, and
[relay-invite-accept.md](./relay-invite-accept.md) for what the person on the other end sees.

## Responsibilities

This lane decides **which invite is the live one for a given person** and what happens to the
previous one. It decides nothing about how a number is validated or verified, nothing about how the
recipient's flow behaves, and nothing about how an invite row is cached.

Three things it needs live outside the feature folder, because other features share them:
`useRelayInvites` (the list query and every mutation) and `useSentInviteLog` in
`apps/web/src/app/hooks/`, and the list rows themselves, rendered by home's `ChannelList` and by
`PlaceChannelManagePage`.

## The shared contract

### Issuing

`useRelayInviteMutations().createInvite` is the only way an invite is made, and it attaches two
fields centrally so no call site can forget them:

- **`expiresDays: 1`.** The server's own default is three days; sending one narrows the window a
  phone-bound link is exposed for. The number reaches no copy — screens render the returned
  `expiredAt`.
- **`phone` in E.164** (`+821012345678`), never the local `0…` form. The backend's hasher reads
  `countryCode` only on a local number and silently ignores it once the string starts with `+`, so
  E.164 is the one shape that hashes correctly whether or not the country code is trustworthy.

`channelId` is the third field and is conditional: omitted for a brand-new 1:1, where the server
creates the room on accept, and supplied when inviting someone back into a room that already exists.
That is what keeps a 1:1 conversation one room rather than a new one per invitation.

The response carries the deeplink. `composeInviteSmsBody` builds the message once, shared by the
first issue and a waiting-screen reissue so both read identically, and `sendInviteMessage` delivers
it: the native SMS composer inside the app, a clipboard copy otherwise — including when the bridge
rejects or reports it could not open. It never rejects; a clipboard failure is `false`, and the
invite is still issued, just without an automatic hand-off.

"Could not open" means an explicit `data.success: false` in the `OnSendSms` reply, and nothing else.
App versions up to 0.28.4 send that reply with no `data` at all, and answer a composer that could not
open with a failed reply instead, which rejects — so a resolved reply without `data` is a composer
that opened. Reading it the other way copied over the user's clipboard on top of every composer it
had just opened, and toasted "copied" instead of "sent".

Opening the composer puts the app in the background, and on Android the reply cannot reach the page
until the user comes back ([`libs/bridges` scenario 7](../../../../../libs/bridges/README.md#7-another-app-in-front-of-this-one)).
The bridge holds its timeout while the page is hidden, so a user who spends a minute writing the SMS
comes back to `'sms'`, not to a 15-second timeout followed by a clipboard request that times out too
and reports the invite as undelivered.

Each success is recorded in `useSentInviteLog`, keyed by E.164, holding the invite id and the
recipient's name. This is a **local convenience cache, not a source of truth**: the server returns
only `last4`, so a device that did not issue the original invite has nothing to prefill a field
with, and re-invite detection has nothing to match on. Reaching the form with an empty number is a
normal path, not an error.

### Three gates, in order, and none of them overlay the form

| Gate                | Condition                         | What renders instead                                 |
| ------------------- | --------------------------------- | ---------------------------------------------------- |
| Guest               | `isGuest`                         | `InviterVerifyPrompt` → verification sheet (`login`) |
| Main user, no phone | `!isGuest && linked.phone absent` | `InviterVerifyPrompt` → verification sheet (`link`)  |
| No place profile    | `isProfileAbsent === true`        | `PlaceProfileCreateDialog`                           |

The form renders only when all three clear (`showForm`). **Rendering a form and covering it with a
dialog is the thing to avoid**: it leaves a frame in which the unmet condition can be submitted
past. Verification is offered at most once per visit, so a `403` that verification cannot fix — a
withdrawn or suspended account — explains itself instead of reopening the sheet forever.

The profile is a precondition rather than a requirement. Closing its dialog leaves for home, and
leaving means no invitation was issued, so "an invite sent by someone with no name" has no path into
existence. The same shape as the accept lane's profile step, for the same reason.

The whole page is **one `return`** with the verification sheet in a fixed child slot. Two returns
would place it at a different index per branch, and React reconciles by position — so the promotion
that flips `isGuest` mid-visit would remount the sheet and lose its state.

### Re-invite detection

On submit, `useSentInviteLog.findByPhone` looks for this number. A hit opens `ReinviteDialog` in one
of three variants, resolved from the matched row's state:

| Prior state                   | Variant    | What the confirm does                                               |
| ----------------------------- | ---------- | ------------------------------------------------------------------- |
| `pending`                     | `pending`  | **Nothing is issued** — the only action is "see the waiting screen" |
| `expired`, `canceled`, unseen | `expired`  | Retire, then issue                                                  |
| `rejected`                    | `declined` | Retire, then issue                                                  |

The `pending` variant deliberately offers no reissue. A cancel API exists, but quietly replacing a
live invitation for someone who came to check on one they already sent is a violation of intent, not
a convenience.

A prior that fell outside the `invite.list` window resolves to `undefined` and lands on `expired` —
either way the old link cannot be relied on and a fresh issue is the only way forward.

**Re-invite mode is a different path.** Arriving from the 1:1 room's footer with route state
`{ channelId, name?, phone? }`, the page prefills what it knows, skips the same-number dialog
entirely, and issues with the `channelId` attached. It still retires first, but it looks the prior
up **by channel** rather than by phone. A `409` there means the recipient accepted while the sender
was on this screen, so the page goes to the room instead of issuing a code nobody needs.

### Retiring, which is the rule

`useRetireInvite` is the single implementation of "get rid of the previous one", shared by both
reissue paths. Its outcome is a closed set and the caller owns the abort policy:

| Prior state                     | What happens                       | On failure                                           |
| ------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `pending`                       | `invite.cancel` — **must succeed** | Abort the reissue. `409` aborts and re-asks the list |
| `expired`                       | `invite.cancel`, best effort       | Proceed — the old code is already dead               |
| `rejected`                      | Local dismiss                      | —                                                    |
| `canceled` / `accepted` / other | Nothing (`skipped`)                | —                                                    |

Outcomes: `canceled`, `dismissed`, `conflict`, `failed`, `skipped`.

**The `pending` row is the one that cannot be reordered.** Issue before cancelling and, for a
moment that can become permanent if the cancel fails, one phone number holds two live codes. Every
other row is already spent, so tidying it is courtesy.

A `pending` or `expired` retire counts as `canceled` **whenever the call did not throw** — the
response's `state` is not inspected. A cancel racing the recipient's decline comes back `rejected`,
because a cancel does not overwrite a final mark, and the old link is equally dead either way.

A `rejected` row cannot be cancelled at all: the server keeps it forever, it never decays to
`expired`, and cancel will not overwrite it. A local dismiss is the only way to clear the row, and
that dismiss is a `dismissedAt` stamp on the cache row itself rather than a side list — see
[`@chatic/data`](../../../../../libs/data/docs/repositories/README.md).

### Codes are composed, never stored

`composeInviteCode({ id, code })` builds `invt:<id>:<code>` in the scope of the call that needs it.
But a cache-first row carries **no `code`** — it was never persisted, being a credential — so any
row rendered before `invite.list` returns cannot be acted on directly. `resolveInviteCode` handles
that: match against the current list, and on a miss re-ask the server **once** before giving up.
Still failing means there genuinely is no code to act with, which the caller reports as a failure
rather than retrying forever.

### Waiting, and learning about an acceptance

There is no notification packet, so the only way the inviter learns anything is by asking again.
Two cadences do that:

- **The waiting screen** adds a 30-second poll for as long as it is mounted, on top of the query's
  window-focus refetch. The cadence is handed to react-query rather than run as a `setInterval` +
  `refetch()`, because a manual refetch ignores the query's `enabled` gate and would keep asking
  `invite.list` while the relay socket is unauthenticated — answered with `401 UNAUTHORIZED`, twice
  per attempt thanks to the retry.
- **Background sync** covers the rest of the app on a 60-second tick, but opts **out of the periodic
  leg** unless a `pending` row exists in the cache. It checks that with a cache read, not a packet —
  the entire point is deciding whether a packet is worth sending. An unreadable cache answers "no",
  because the rising-edge trigger re-asks regardless and the cost of being wrong is one delayed
  refresh, never a lost one.

When the state turns `accepted`, `useAcceptedChannelSync` watches for the channel to appear locally,
for up to 8 seconds. It reports `unknown` immediately when the view carries no `channelId` — the
common case, since the room is created asynchronously — so the screen shows a "check back from home"
fallback rather than spinning on something that may never arrive.

`expired` swaps in the expiry block and keeps the reissue action. `rejected` swaps in the decline
block and keeps **both** actions, invite again and cancel. The server would not overwrite the decline,
so canceling a declined invite is the same local dismiss a reissue makes (the `rejected` row above):
it takes the invite off the list and goes home, and no packet is sent. The confirm says so
(`inviteWaiting.cancelDialog.rejectedDescription`) rather than the live invite's "they can no longer
join".

The validity card under a live invite is a spaced clock, `HH : mm : ss 남음`, ticking every second,
with the days folded into the hours (a day and three hours reads `27 : 00 : 00`). It turns red inside
the last ten minutes, and an expired link reads `00 : 00 : 00` in red without "left". The formatter
(`utils/countdownClock.ts`) is shared with the 1:1 room's invite strip, which prints the same clock
with bare colons.

### List rows

`useInviteListRows` is what home's `ChannelList` and `PlaceChannelManagePage` both render, so the
filter exists once: `pending`, `expired` or `rejected`, with an `id`, and not locally dismissed.

- `accepted` is out because the real channel becomes the visible row; showing both would duplicate
  the conversation.
- `canceled` is out because the sender retired it.

`resolveInviteRowBadge` maps the state to a badge. `rejected` keeps the `expired` tone — it is the
same "this invite is spent" signal, and only the label and the row's second line differ. `accepted`,
`canceled` and an unrecognized state resolve to `null`, which is defence in depth behind the filter
rather than a reachable case.

## What not to do

- **Do not issue before retiring a `pending` prior.** Two live codes for one number is the state
  this lane exists to prevent.
- **Do not read the retire response's `state` to decide whether it worked.** The call not throwing
  is the verdict.
- **Do not offer a reissue on the `pending` re-invite dialog.**
- **Do not cancel a `rejected` row.** Dismiss it locally; the server will not overwrite a final mark.
- **Do not put a hardcoded lifetime in copy.** Render `expiredAt`.
- **Do not send a local-format phone number to `createInvite`.** It hashes wrong.
- **Do not render the form behind a gate dialog**, and do not split the page into two returns.
- **Do not treat `useSentInviteLog` as authoritative.** It is per-device, and the server never
  returns a full number to rebuild it from.

## Notes for implementers and tests

- `invite.list` is asked with `limit: 100` and has no cursor, so there is no paging. A row outside
  that window is invisible to re-invite detection, the list and the waiting screen alike — and `resolveReinviteVariant` then offers the `expired` copy for a prior it cannot see.
- `useSentInviteLog`'s storage key is versioned, and bumping it **is** the migration — there is no
  `persist` middleware and no `migrate` hook. The previous key was keyed by local Korean digits,
  which collide once invites can go anywhere; its entries were left to lapse.
- The waiting screen exempts a retire it made itself from its own "this invite is gone" redirect,
  or a reissue would bounce the user home mid-flow.
- The re-invite-into-a-channel path holds its own submitting flag across the retire round trip. The
  dialog path does not need to — its sheet closes on the way in — but the form's submit button stays
  on screen, and a second tap during the cancel would retire twice and issue two codes.

## Further reading

- [README](./README.md) — the folder map, the entry funnel, and the rules both lanes share
- [relay-invite-accept.md](./relay-invite-accept.md) — the recipient's side of every state named here
- [auth](../auth/README.md) — phone verification and the country-aware number input the form mounts
- [channels](../channels/README.md) — the 1:1 room that sends people here in re-invite mode
- [home](../home/README.md) — the list surface these rows appear on
- [`@chatic/data`](../../../../../libs/data/docs/repositories/README.md) — the invite repository, the
  cache-first read, and the `dismissedAt` field
