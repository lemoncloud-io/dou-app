# App helper rules — the judgements in `app/utils/` that screens share

> Scope: `apps/web/src/app/utils/`. These are small pure functions several screens depend on agreeing
> about. The reasoning is recorded here so a second copy is not written when one screen needs a tweak.

## Cloud row state (`cloudRowState.ts`, `cloudDisplayName.ts`)

The cloud switcher (home) and cloud management (my page) read one derivation, so a cloud never reads one
way in the sheet and another on the management screen.

`resolveCloudRowState` turns the relay's `status` and the plan axis into one of six states:

| State           | Relay `status`          | Meaning                                                                      |
| --------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `provisioning`  | `init`, `reserved`      | The relay has the record but the slot is not deployed yet                    |
| `setupFailed`   | `error`                 | Provisioning errored                                                         |
| `restricted`    | `suspended`             | The relay holds it: over the allowance after a downgrade, or the plan lapsed |
| `released`      | `expired`               | Gone; the catalog hides these by default, so a row rarely sees one           |
| `dropScheduled` | otherwise, `plan: drop` | The user gave this cloud up at the next renewal; it works until then         |
| `ready`         | otherwise               | Active, nothing to say                                                       |

- `status` already folds the other axes in priority order (released, held, error, provision), so it is
  read as the truth for everything except the drop mark. `state$.plan` is a plan for the _next renewal_,
  not a present state, so the relay keeps it out of `status` on purpose; it only matters on an otherwise
  active cloud, and a held cloud is already restricted, which outranks a mark it may also carry.
- Only a live, deployed cloud has a session to switch to: `isCloudEnterable` is `ready` or
  `dropScheduled`.
- `needsCloudAttention` (the "check the cloud's information" caption and the chevron into cloud
  management) is true for `setupFailed`, `dropScheduled` and `restricted` — states with something to
  explain. A provisioning row's badge already says it and waiting is the only action.
- The relay takes a setup retry only while the cloud holds no workspace slot, so `canRetryCloudSetup`
  is `setupFailed` with neither `slotId` nor `accountNo`. One that failed after its slot was assigned
  (during the deploy) is refused, so the retry is not offered and releasing the cloud is what is left.
- `cloudDisplayName` is the name, else the local part of the recovery email, else an empty string — a row
  with nothing to show says so itself (the switcher asks for a profile). The subscription screens keep
  their own, longer chain because a keep-clouds card must never be blank.

## Who an invited cloud belongs to (`invitedCloudAcceptance.ts`)

An invite is accepted by the device (guest) user, the `delegatorId` sent with the invite login, and the
server grants the cloud to that user only.

- Inside a shell the invited-cloud cache is one partition shared by everyone who uses the device, since
  another account can sign in. A row one user left behind used to reach the next user's cloud list and
  background sockets, and delegating into a cloud the user was never granted makes the server mint an
  empty user there — one the user's own later acceptance never attaches to, so every room invited into
  then answers 403.
- `withAcceptor` appends the acceptor once and keeps the existing ones. With no `delegatorId` there is
  nothing to record and the list is returned as it was.
- `isAcceptedBy` keeps a row with **no** acceptors: it predates the field, and invited clouds have no
  server list to refill from, so hiding one would lose it for the guest it does belong to. A row with
  acceptors is offered only to one of them, and to nobody when there is no id to match.
  `useInvitedClouds` asks it for both ids of the session (the guest's `delegatorId` and the relay uid)
  because rows are recorded under either.
- In a plain browser tab the cache is the tab's `sessionStorage` and ends with the tab, so the check is
  rarely load-bearing there. It stays because logout does not clear the tab's rows, so the guest a tab
  signs back in as is not guaranteed to be the one that accepted them.

## "Does this place have no profile of mine?" (`placeProfile.ts`)

`isPlaceProfileAbsent` is **awaited, not observed**. The reactive read returns `null` for both "still
loading" and "genuinely absent", and the create form starts from an empty nick, so one loading frame judged
as absent would let a save overwrite an existing nick and photo. The invite accept chain and the invite
form can both simply await one round trip.

- `nick` alone is not enough in the other direction: the profile read is a get-or-create, so it answers
  even when there is no real profile, and `active === false` is the flag that says so. A missing nick
  without that flag is inconclusive.
- It **fails open.** Anything short of a definite "no profile" — a read that throws, an inconclusive row —
  returns `false` and lets the caller proceed (the failure is logged). Blocking on an inconclusive read
  would turn a profile-read outage into "cannot invite / cannot accept", while guessing "absent" risks the
  overwrite. The precondition shapes the normal path; it does not hold the user's goal hostage on the
  abnormal one.

## Socket error helpers (`errors.ts`)

- `toError` turns a raw DOM `Event` into a describable error (for a WebSocket, its type, url and
  `readyState`) instead of `[object Event]`. That string was seen in production as an
  `unhandledrejection`: the socket layer builds a per-attempt "connection opened" promise and rejects it
  with the raw event on failure, nothing awaits it (the transport drives reconnects from callbacks), so the
  rejection reaches `window` as an unhandled `Event`. The WebSocket is duck-typed (`url`, `readyState`)
  rather than checked with `instanceof`, so it does not depend on the global existing in every test or
  server environment.
- `getSocketErrorCode` reads a numeric `errorCode` carried on the error first — the sockets SDK drops the
  `:error` frame's code and the runtime's socket manager puts it back on requests made through its
  facade — and otherwise a leading 1xx–5xx status in the message (`408 REQUEST TIMEOUT - …`,
  `403 FORBIDDEN - …`). Callers branch on the code and never on wording, since server messages are not a
  contract. The runtime (`libs/transport`'s `socketErrorCode`) and desktop-web keep the same parser; a
  change to one belongs in the others.

## Soft keyboard detection (`softKeyboard.ts`)

`typesOnSoftKeyboard()` is true for a mobile user agent only when the primary pointer is not a fine
one (`(hover: hover) and (pointer: fine)`). The user agent alone cannot tell: the iOS app running on a
Mac and an iPad on a trackpad still report an iPad while every key comes from a hardware keyboard. The
primary pointer is asked, not "any pointer", so a phone that merely has a stylus or a paired mouse nearby
does not qualify. The return-key flow, tap-to-dismiss and the composer's Enter all use this one test.

## Route trail (`routeTrail.ts`)

The trail is a small ring buffer of recent paths, attached to feedback reports that land in a shared chat
channel. Consecutive duplicates are ignored so a router resubscribe or a search-param-only change does not
push the real previous screen out. Callers pass **`pathname` only**: path segments are opaque resource ids
the report already carries, but query strings (`/invite/accept?…`, `/s?…`) are capability tokens.
