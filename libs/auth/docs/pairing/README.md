# pairing — signing a device in from another device

A device that is not signed in (a browser tab, or a phone) shows an 8-digit code, and a signed-in app
approves it. `pairing/` holds the requesting side and the facts both sides need; the REST calls
themselves are `PairingRepository`'s (`@chatic/data`), all signed relay requests.

Four files carry most of it, and their names are close, so this is what each one is:

| File                     | What it is                                                                                                                                                                                                                         | Holds state            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `pairedSession.ts`       | **The checks.** Is this device signed in through someone else's approval — a secondary device (`isPairedSession`)? Is the relay session a guest (`isRelayGuest`)? Is this guest inside a cloud of its own (`isInOwnCloudSession`)? | no                     |
| `pairedClouds.ts`        | **The list.** `PairedCloudStore`: the ids of the clouds this guest entered through a pairing (`chatic-paired-cloud-ids`), and their names (`chatic-paired-cloud-names`)                                                            | the list and its names |
| `pairedCloudSessions.ts` | **What acts on the list.** `PairedCloudSessions`: enter a paired cloud, re-issue it, re-check it, end it                                                                                                                           | uses the list          |
| `pairingClient.ts`       | **The device's label.** What a requester tells the approver about itself (`Chrome · macOS`, `iPhone`), and how a device-list row is named (`deviceDisplayName`). Not a network client                                              | no                     |

The rest: `pairingRequestFlow.ts` is the code screen's request-and-poll loop, `pairingClaims.ts` keeps a
relay approval's session token out of the claim's answer, `pairingErrors.ts` names the approval side's
failures.

- **`PairingRequestFlow`**, a class with no React in it, is the code screen's loop (app-runtime's
  `usePairingRequest` drives it): request a code, poll `claim` every `interval` seconds, then sign in. The
  claim it is handed answers token-free (`PairingClaimAnswer`): a relay approval's session is a
  `sessionHandle`, and `applySession(sessionHandle)` signs in with it. A cloud approval enters that cloud
  as a guest (`enterCloud`; app-runtime readies it with `pairedCloudSessions.prepareEntry`, below, and
  then switches with the screen's own switch).
- **`pairingClaims.ts`** is where a relay approval's session waits between the claim and the sign-in.
  `holdPairingClaim(view)` takes the relay's answer, keeps the session and answers with a handle in its
  place; `applyPairingSession(handle)` signs in with it through `applySessionToken` — the same path a
  phone login takes. At most two sessions wait — a device shows one code screen, and a code replaced
  while its claim was in flight can land two approvals together — and each is dropped once applied or
  once applying it failed: the flow does not retry an approval it could not apply, it starts over with a
  new code. A cloud approval is entered by delegation, so a session it carries is not kept. A handle not
  held is refused with `PAIRING_SESSION_UNKNOWN`. Both run
  as runtime-core's engine commands `claimPairing` and `applyPairingSession`, so on the phone the token
  never leaves the process that owns the session.
    - **One claim at a time, and an approval is never dropped.** The session rides only the first
      `approved` answer; the server answers `claimed` afterwards. So the next claim waits for the last to
      settle, a stop and start (strict mode's remount) resumes the same loop instead of opening a second
      one, and stopping only stops scheduling — a claim already on the wire is handled to the end.
    - A network failure keeps polling until the code expires; a 4xx ends it. A 503 on the request means
      the drawn code was taken, and one more request is enough.
- **`pairedClouds`** (a `PairedCloudStore` over `chatic-paired-cloud-ids`, in the session's own storage) lists the clouds a guest
  entered through a pairing. A guest's cloud catalog is empty, so this list is what puts those clouds in
  the switch sheet. It is a plain store with no other dependency, so `isPairedSession` and the relay
  logout can read and clear it without pulling the socket runtime in.
    - It also keeps each listed cloud's name (`setName`, `names`, `subscribeNames`), read from the relay
      once the browser is inside the cloud (app-runtime's `syncPairedCloudName`). A paired cloud has no
      row in the cloud cache — a row there is either owned or invited — so this is the only place its
      name is kept. A name is kept only for a cloud on the list, and `remove` and `clear` drop it with
      the cloud.
- **`PairedCloudSessions`** (`pairedCloudSessions.ts`, one instance `pairedCloudSessions`) is the life of
  a paired cloud, with its collaborators — the list, the identity map, the token exchange, the socket
  re-registration, the place alignment, the credential teardown — passed to its constructor:
    - `prepareEntry(cloudId)` — lets an exchange for the cloud already on the wire finish, forgets the
      uid recorded for the cloud, re-issues the cloud's tokens and adds the cloud; the caller then
      switches to it its own way (the code screen does, so the switch keeps its trace and in-flight
      key). The forgetting is what lets the re-issue through: an exchange refuses to move a cloud
      off its recorded uid ([docs/session/](../session/README.md)), and the approver replacing a tab's
      own invite identity is exactly such a move, made on purpose here. The cloud joins the list before the
      switch: from the re-issue on, the tab holds the approver's tokens for it, so a switch that fails
      must still leave it where the check watches it. The re-issue comes first because a
      switch replays the tokens it already holds for the cloud: a tab holding older tokens of its own
      there (an invite) would have entered as itself and turned into the approver at the next re-issue,
      mid-session and without a word.
    - `reissue(cloudId)` — re-issues through the relay's delegation and carries the session along as a
      renewal does: the socket serving the cloud re-registers, the committed cloud is aligned back to the
      selected place. Unlike `renewCloudSession` it throws, because a paired cloud needs the 403.
    - `check(cloudId)` / `checkAll()` — `reissue`; a refusal over an ended pairing gets the
      terminal-expiry teardown (cached tokens dropped, the session stores cleared if it is the committed
      cloud) and `end`; anything else waits for the next round.
    - `end(cloudId)` — **the one invariant**: off the list, and the uid recorded for the cloud (the
      approver's) forgotten, so the identity map stops partitioning that cloud's cache under the approver.
- **`checkPairedClouds()`** is the round a running app makes (runtime-core's `checkPairedClouds` command):
  nothing with no paired cloud; a device that has since signed in to an account of its own ends each
  cloud of its guest-era list instead of checking it, since it now enters clouds through that account —
  ended, not just cleared, so the approver's uid goes too and the account's own entry is not refused as
  a change of user; otherwise
  `checkAll`, answering the clouds that ended. **`endPairedCloud(cloudId)`** ends a paired cloud whose
  refusal the caller has already read (`isRefusedForEndedPairing`), and answers whether it was one —
  the engine's `endPairedCloud`, behind app-runtime's `forgetRefusedPairedCloud`.
- **`isInOwnCloudSession`** — is this guest signed in to a cloud on its own (the committed cloud is
  neither the relay nor a paired cloud)? A device asks for a pairing only while signed out, so the code
  screens ask such a guest to sign out of the cloud first.
- **`isPairedSession`** — is this a secondary device? A relay pairing's `$auth` carries `purpose` and
  `pairingId`, which no other login writes; a guest holding paired clouds counts too. A secondary device
  signs out with its approver, so it neither approves others nor lists approvals.
- **`isRefusedForEndedPairing`** — the relay refused a cloud with a 403 naming the pairing or its approver
  (`pairing revoked`, `approver session revoked`, …). Any other 403 — stale relay signing credentials
  notably — must not sign a device out. The relay keeps an ended grant tied to the auth session that
  claimed it and refuses that session's delegation into the cloud even where the session has a
  membership of its own (an invite); only a new auth session clears it, which is why an app signs the
  device out when it meets one.
- **`classifyPairingError`** names the approval side's failures (`notFound` · `expired` · `codeRefused`
  · `targetRefused` · `alreadyHandled`) so both apps word them the same way.
- **`deviceDisplayName`** names a row of my device list. Phones and the desktop app save no name of their
  own, so the server keeps the user agent there; it becomes `iPhone` / `Android`, the OS, or
  `<browser> · <OS>` instead of a raw `Mozilla/5.0 (…)` line.
- **`pairingClientOf`** is what the request tells the approver about this device: the socket's own
  platform and label, and `iPhone` / `Android` for a phone, whose injected model is only a hardware id.

The hooks over these — `usePairingRequest`, `useIsPairedSession`, `usePairedCloudIds`,
`usePairedCloudNames`, `usePairingAwareLogout`, `usePairedCloudCheck` — are app-runtime's
([its session doc](../../../app-runtime/docs/session/README.md#the-pairing-hooks)).

## Further reading

- [docs/session/](../session/README.md) — the token exchange and cloud entry a paired cloud goes through
- [`apps/web` pairing](../../../../apps/web/docs/feature/pairing/README.md) — the code and approval screens
