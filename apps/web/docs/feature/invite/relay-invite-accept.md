# relay-invite-accept — the recipient's lane

Someone taps a link in an SMS. Several minutes later they are in a DM room with the person who sent
it, having proved a phone number and picked a name along the way. Everything between those two
moments is one hook, `useRelayInviteFlow`, and one screen that switches on its phase.

This is the relay half of `/invite/accept`. The route also carries cloud invitations, but that lane
is a different backend contract — REST, and a room that already exists — and it lives in
[auth](../auth/README.md). See [README](./README.md) for how a link reaches the route at all.

## Responsibilities

`RelayInviteAccept` holds no decisions — it is a list of `if (flow.phase === …)` returns. Every
judgement is in `useRelayInviteFlow`, which is why the phases below are the whole feature. The third
tier of the room hunt is the one piece outside the folder: `useAwaitInviteChannel` sits in
`apps/web/src/app/hooks/`, because the sender's waiting screen watches for a channel the same way
and neither lane owns it.

This lane decides **when it is safe to accept**, and what to show when it is not. It decides nothing
about how a phone number is proved, nothing about how a place profile is saved, and nothing about
what a DM room looks like once entered — all three are screens it mounts and hands control back
from.

## The shared contract

### Phases

`useRelayInviteFlow(code)` exposes a `phase`, an `invite`, a `notice`, a countdown, and the handlers
that move between them.

| Phase             | What is on screen                                                     |
| ----------------- | --------------------------------------------------------------------- |
| `loading`         | The entry `invite.get` is in flight                                   |
| `review`          | The accept screen: who invited you, what you are joining, a countdown |
| `declining`       | The decline-confirm dialog                                            |
| `submitting`      | Re-validating, and possibly accepting — the CTA spins                 |
| `verifying`       | `PhoneVerifyScreen`, on the same full-screen surface                  |
| `profiling`       | `PlaceProfileCreateDialog`, only when the place has no profile        |
| `awaitingChannel` | Accepted; hunting for the room that the accept created                |
| `notice`          | Terminal: a dialog explaining why this invitation is over             |
| `closed`          | Terminal: we navigated away                                           |

### Notices

Eight terminal notices, each keying its copy at `inviteAccept.dialog.${notice}`: `expired`,
`alreadyJoined`, `inviteCanceled`, `rejected`, `notFound`, `wrongNumber`, `taken`, `generic`.

Four arrive as a **state**, not an error — `expired`, `accepted`, `canceled` and `rejected` are
answers to a successful read, and both the entry read and every re-validation branch on them
identically. The rest come from `resolveNotice(status, stage)`:

| Status | Reading (`get`) | Accepting (`accept`) | Rejecting (`reject`) |
| ------ | --------------- | -------------------- | -------------------- |
| `404`  | `notFound`      | `notFound`           | `notFound`           |
| `409`  | `taken`         | `taken`              | `alreadyJoined`      |
| `400`  | `notFound`      | `expired`            | `notFound`           |
| `403`  | `notFound`      | `wrongNumber`        | `notFound`           |
| other  | `generic`       | `generic`            | `generic`            |

The stage parameter is the whole point. A `400` reading is a malformed code; a `400` accepting is
the invitation lapsing between the check and the accept. A `409` accepting means someone claimed it
first; a `409` rejecting cannot mean that — a relay 1:1 code is bound to one phone hash, so the only
party who could have accepted it is this same person on another device, already in the room. Telling
them "someone else got there first" would be false and would hide the one thing they need to know.

`generic` is the only notice offering a retry, because it is the only one that might not be true.

### `advance()` re-validates, structurally

`review` is the only phase a user acts from, and both actions leave it through one function:
`decline()` opens the confirm, `accept()` calls `advance()`. `advance()` re-reads the invite, then
branches to `verifying`, `profiling`, `awaitingChannel`, `closed` or a terminal `notice` — and the
handlers for verification and the profile call `advance()` again rather than continuing on their own.

That loop is the contract: **`advance()` begins with `invite.get`.** Verification takes
minutes, and in that window the inviter can cancel, the link can lapse, or the recipient can decline
from another device. Re-validation is not something a caller remembers to do; it is the first thing
the only path forward does.

That is also why abandoning a step is safe. Backing out of the profile dialog returns to `review`
without accepting, and pressing accept again simply runs the chain from the top.

### Wait for the relay handshake before the first read

`invite.get` is a relay-pinned packet, and an invite deeplink is the one entry that lands during
boot: guest login, relay token, connect, `device.save` and `auth.update` are all still running while
this flow mounts. Firing early fails with something `resolveNotice` cannot map — no relay slot
bound, `503 SOCKET NOT CONNECTED`, `401 UNAUTHORIZED` — and the reader gets a useless `generic`
dialog on a perfectly good invitation.

So both the entry read and `advance()` first await `waitUntilKindVerified('relay', 10s)`.
**Kind-pinned, not `waitUntilVerified`**: the latter tracks the _active_ slot, which is the cloud
whenever a cloud session is up, and would wave a relay request through mid-handshake. The wait is
best-effort — a timeout proceeds anyway, so a genuinely broken socket surfaces the server's own
error instead of being swallowed as a wait.

The page holds `InviteAcceptLoading` until `isAuthenticated`, for the same reason from the other
direction.

### Verification: `login` or `link`, and why it matters

`verifyMode` is `login` for a guest and `link` for someone who is already a main user but has no
phone number on the account. Sending `login` to the latter is refused by the server
(`@mode[login] is for device session`), and sending `link` to a guest cannot open a session.

Two corrections sit on top of that:

- **A server `403` beats the role cache.** When the accept is refused because the server does not
  see a main user, the flow pins the proof to `login`. `isGuest` leans towards "main user" when the
  role is unknown and reads the cloud token while a cloud is active, so the server's answer is the
  truer one. Without this pin the flow re-derives `link` from a stale `isGuest: false` and the send
  `403`s again with no way out.
- **`link` refuses to start without `last4`.** A `link` confirm binds the number to the account
  **irreversibly** — the backend has no unlink and answers `type-linked` forever after. The server's
  own invite cross-check only exists on `login` (`link-account.ts` reads the code only in that
  mode), so on the `link` path `last4` is the sole thing that can catch a wrong number. With no
  `last4` there is nothing to check against, and the flow fails to `generic` rather than let an
  unverifiable number be written permanently.

Verification is a **one-shot** step. The server derives `needVerify` from whether this account owns
the invited number, so proving a _different_ number leaves it true. Without the guard the flow
bounces straight back and remounts the verify screen as a blank form with no error, forever; with
it, a second pass through `needVerify` ends at `wrongNumber`, which is the honest answer.

### The profile is a precondition, not a gate

The place profile is asked for **immediately before** `invite.accept`, and after the verification
branch. The order cannot be swapped: a device user has no site to write a profile to, and
verification is what promotes them.

Backing out of the dialog returns to `review` — the same handler as abandoning verification, because
it means the same thing — and the invitation is **not accepted**. That is the entire reason the step
sits where it does. Put the profile _after_ the accept and someone who force-quits in between is
left, irreversibly, in a DM with no name. Here that state has no path into existence: the profile
save and the accept are links in one `advance()` chain, and leaving breaks the chain.

Two rules keep the step from misfiring:

- **`isPlaceProfileAbsent` is awaited and fails open.** It answers true only when `nick` is missing
  _and_ `active === false`, because `profile.get-mine` is get-or-create and always answers — so
  `active: 0` is the server confirming an absence. A failed or ambiguous read proceeds to the
  accept. Blocking on the other side would turn a profile-lookup outage into an un-acceptable
  invitation, and the user's goal wins on the abnormal path. Reading a reactive hook instead of
  awaiting would be worse still: `null` there means both "loading" and "absent", and a one-frame
  false positive opens a create form with `initialNick=""` that overwrites a real profile.
- **No `sid` skips the step entirely.** `setMyProfile` asserts a site id, and nothing on this route
  establishes one — the relay sid is written only by an explicit place switch on home, and in a
  browser `storage` is `sessionStorage`, so an SMS link opened in a fresh tab has no sid even for a
  long-standing user. Running the step there would throw inside the dialog and leave the invitation
  permanently unacceptable. `useAwaitInviteChannel` defends the same way.
- **`profileSavedRef` stops it asking twice.** `profile.set` is not guaranteed to be visible to the
  next `get-mine`, so re-asking could bounce the user into the same form again.

### Declining

Decline is final and cannot be undone, so it takes a confirm dialog. `decline()` only moves to
`declining`; `confirmDecline()` sends `invite.reject`.

**The phase stays `declining` while the request is in flight** and `isRejecting` carries the
pending state into the dialog's own `isPending`. Moving to `submitting` instead would be wrong in a
visible way: `submitting` is shared with the accept path and has no dialog branch, so the confirm
would vanish and be replaced by the accept screen spinning — the reader taps decline and watches
something that looks like an acceptance.

Declining needs **no phone verification**. It works straight from the device-user state a deeplink
lands in. Reopening the same link afterwards ends at the `rejected` notice; the server remembers, so
nothing is written locally.

### Finding the room the accept created

The room is created asynchronously, so `invite.accept` may or may not answer with its id. Rather
than assume either way, `useResolveInviteChannel` reads what is in hand and only then falls back:

| Tier | Source                                             | Cost                           |
| ---- | -------------------------------------------------- | ------------------------------ |
| 1    | `channelId` on the accept response                 | None — the spinner never shows |
| 2    | `invite.get` probes at `[0, 1500]` ms              | Up to 1.5s                     |
| 3    | `useAwaitInviteChannel` — watch for a new `dm` row | Up to 20s                      |

Tier 2 is **two probes on purpose**. Each delay is paid before its probe, so a third both postpones
the answer and postpones tier 3, which watches actual channel rows and is the more robust mechanism
— and it polls every 3 seconds on its own, covering what a `+4s` probe would have caught.

The resolver **never rejects**. Unresolved is `null`, which becomes "the room is on its way" and a
trip home; the accept is already on the server, so the next background sync brings the room. A tier-2
error is swallowed for the same reason — the accept succeeded, so a failed probe is not the reader's
problem.

The probe reads only `channelId` and deliberately ignores `state`. It runs after a successful
accept, so `state` is `accepted` — the very value the _entry_ read treats as "already joined".

However it resolves, the flow ends the same way: `setPendingChannel(id)`, then navigate home, where
an existing effect replaces the route with the room.

## What not to do

- **Do not skip `advance()` and call `acceptInvite` directly.** The re-validation is the only thing
  standing between a several-minute verification and accepting an invitation that no longer exists.
- **Do not move the profile step after the accept.** That is precisely the failure it exists to
  prevent.
- **Do not make `isPlaceProfileAbsent` fail closed**, and do not read the reactive profile hook in
  its place.
- **Do not start a `link` verification without `last4`.** The binding cannot be undone.
- **Do not put `confirmDecline` into `submitting`.** There is no dialog branch there.
- **Do not parse error messages.** `getSocketErrorCode` plus the stage is the whole contract.
- **Do not let the notice dialog's own dismiss navigate during a retry** — `retry` reopens the entry
  read, and the dialog fires `onOpenChange(false)` on its way out.

## Notes for implementers and tests

- A generation counter (`runIdRef`) plus an `aliveRef` means a response that arrives after the flow
  moved on writes nothing. Every `await` in the hook is followed by an `isStale(run)` check; a new
  `await` needs one too.
- Latest values (gateways, navigation) are read through a `latest` ref so callback identity stays
  fixed across renders.
- `useResolveInviteChannel` exposes `probeDelaysMs` so tests can shrink the cadence, the same idiom
  as `awaitChannel`'s `timeoutMs` / `pollMs`. Neither should be exercised against real time.
- `PlaceProfileCreateDialog` pulls in `@chatic/app-runtime`, whose config barrel the jest transform
  cannot parse. Import it by file path rather than through a barrel, and stub it in consuming
  suites the way `PhoneVerifyScreen` is stubbed.
- The invited user's server display name is `*<last 4 digits>` — a number-derived account has no
  other name. The heading falls back only when `inviter$.name` is _empty_, so a masked name is never
  mistaken for a missing one.
- `channelDeleted` copy exists in the accept screen but nothing in the relay lane triggers it; the
  relay backend has no matching signal.

## Further reading

- [README](./README.md) — how a link reaches this route, and the rules both lanes share
- [relay-invite-sender.md](./relay-invite-sender.md) — the other end, including what the inviter
  sees when this flow declines
- [auth](../auth/README.md) — phone verification, and the cloud lane this route also carries
- [channels](../channels/README.md) — the DM room this flow ends in
- [`@chatic/data`](../../../../../libs/data/docs/repositories/README.md) — the invite and channel
  repositories behind every packet named here
