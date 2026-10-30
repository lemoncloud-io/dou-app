# pairing — signing a device in from another device

A device that is not signed in (a browser tab, or a phone) shows an 8-digit code, and a signed-in app
approves it. `pairing/` holds the requesting side and the facts both sides need; the REST calls
themselves are `PairingRepository`'s (`@chatic/data`), all signed relay requests.

Four files carry most of it, and their names are close, so this is what each one is:

| File                     | What it is                                                                                                                                                                                                                         | Holds state   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `pairedSession.ts`       | **The checks.** Is this device signed in through someone else's approval — a secondary device (`isPairedSession`)? Is the relay session a guest (`isRelayGuest`)? Is this guest inside a cloud of its own (`isInOwnCloudSession`)? | no            |
| `pairedClouds.ts`        | **The list.** `PairedCloudStore`: the ids of the clouds this guest entered through a pairing (`chatic-paired-cloud-ids`)                                                                                                           | the list only |
| `pairedCloudSessions.ts` | **What acts on the list.** `PairedCloudSessions`: enter a paired cloud, re-issue it, re-check it, end it                                                                                                                           | uses the list |
| `pairingClient.ts`       | **The device's label.** What a requester tells the approver about itself (`Chrome · macOS`, `iPhone`), and how a device-list row is named (`deviceDisplayName`). Not a network client                                              | no            |

The rest: `pairingRequestFlow.ts` is the code screen's request-and-poll loop, `pairingErrors.ts` names
the approval side's failures.

- **`PairingRequestFlow`**, a class with no React in it, is the code screen's loop (app-runtime's
  `usePairingRequest` drives it): request a code, poll `claim` every `interval` seconds, then sign in. A relay approval's
  session goes through `applySessionToken` — the same path a phone login takes — and a cloud approval
  enters that cloud as a guest through `pairedCloudSessions.enter` (below).
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
- **`PairedCloudSessions`** (`pairedCloudSessions.ts`, one instance `pairedCloudSessions`) is the life of
  a paired cloud, with its collaborators — the list, the identity map, the token exchange, the socket
  re-registration, the place alignment, the credential teardown — passed to its constructor:
    - `enter(cloudId, switchCloud)` — lets an exchange for the cloud already on the wire finish,
      re-issues the cloud's tokens, adds the cloud, then switches. The cloud joins the list before the
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
    - `forgetRefused(cloudId, error)` — `end` for a paired cloud the relay refused over an ended pairing.
- **`isInOwnCloudSession`** — is this guest signed in to a cloud on its own (the committed cloud is
  neither the relay nor a paired cloud)? A device asks for a pairing only while signed out, so the code
  screens ask such a guest to sign out of the cloud first.
- **`isPairedSession`** — is this a secondary device? A relay pairing's `$auth` carries `purpose` and
  `pairingId`, which no other login writes; a guest holding paired clouds counts too. A secondary device
  signs out with its approver, so it neither approves others nor lists approvals.
- **`forgetRefusedPairedCloud`** is `pairedCloudSessions.forgetRefused`, published for the switch sheet.
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
`usePairingAwareLogout`, `usePairedCloudCheck` — are app-runtime's
([its session doc](../../../app-runtime/docs/session/README.md#the-pairing-hooks)).

## Further reading

- [docs/session/](../session/README.md) — the token exchange and cloud entry a paired cloud goes through
- [`apps/web` pairing](../../../../apps/web/docs/feature/pairing/README.md) — the code and approval screens
