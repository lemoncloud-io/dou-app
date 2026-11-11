# ADR-0247: Device pairing screens follow the session kind

> Status: Accepted · Decided: 2026-10-27 · Implemented: `feat/device-pairing`
> · Scope: `apps/web/src/app/features/pairing/`, `apps/desktop-web/src/app/features/pairing/`,
> `libs/app-runtime/src/session/pairing/`, `libs/data` (`PairingRepository`, `UserRepository.listDevices`)
> · The module docs are [apps/web pairing](../../apps/web/docs/feature/pairing/README.md),
> [apps/desktop-web pairing](../../apps/desktop-web/docs/pairing/README.md) and
> [libs/auth pairing](../../libs/auth/docs/pairing/README.md)

## Context

The relay now lets a device that is not signed in — a browser tab, or a phone — show an 8-digit code
that a signed-in device approves (`/pairings/**`), and the socket servers list and unlink a user's
devices (`user.list-device` · `user.unlink-device`). The server decides who may call what by the kind
of session: only a guest session requests a code; only a device session checks and approves one; the
session a relay approval issues is a pairing session, which signs out with its approver.

The app had to decide where each screen shows, what a browser's "device" is, how a browser that was
approved into one cloud finds that cloud again, and what happens to approvals when the approver signs
out. None of it is enforced by the server in the way a user would expect from the screens.

## Decision

1. **Screens are chosen by the session kind: the requester is signed out, the approver signed in.**
   The code screen shows to a guest (a browser, or the phone app) — and a guest inside a cloud it
   entered on its own invite is signed in there, so it is asked to sign out of that cloud first. The
   approval screen and the "approved sign-ins" list show only inside the apps, on an **account**, on a
   session that is not itself a pairing session; the device list to every signed-in account. The server
   would take an approval from a browser's phone login, and a guest app's approval of its invited
   clouds, too — keeping approvals in signed-in apps is the screens' rule, not the server's. A device
   signed in through a pairing (its relay `$auth` carries `purpose` and `pairingId`) is a **secondary
   device**: it never approves another and never lists approvals.
2. **A browser's device is its tab.** The device id and the session stay per tab (`sessionStorage`), as
   they are for every browser sign-in. A new tab starts as a guest and pairs again; closing a tab ends
   its sign-in. The device id and the session live and die together, so unlinking a device always
   reaches the tab it names.
3. **A cloud approval leaves the browser a relay guest, with a paired-cloud list.** The browser enters
   the cloud through the ordinary cloud switch (the relay's delegation answers for the approver), and
   remembers it in `chatic-paired-cloud-ids`, in the session's own storage. A guest's cloud catalog is
   empty, so this list is what the switch sheet shows it from, and a guest holding one counts as a
   secondary device. In that cloud the browser is the approver, even where it holds older tokens of its
   own for the cloud from an invite: the tokens are re-issued by delegation before the switch, because a
   switch replays the tokens a tab already holds and would have kept the browser's own identity until
   the next re-issue swapped it, unannounced.
4. **A paired cloud is re-checked through the relay.** At mount, on foreground return and every ten
   minutes its tokens are re-issued by delegation; a 403 (the approval was revoked, or the approver
   signed out) tears the cloud down, drops it from the list and **signs the device out**. The approval
   was the device's sign-in, so its end is a sign-out — and a switch the relay refuses over a revoked
   approval signs out the same way.
5. **An approving app signing out ends what it approved.** Before the logout it reads its approvals,
   confirms when any still stand, revokes them, then logs out. A failed read or revoke never blocks
   the logout.
6. **The device list follows the active slot.** In a cloud it lists that cloud's devices, not the
   relay's.

## Consequences

- A cloud server knows nothing of the relay's pairings, and the cloud socket's own token refresh is not
  turned off for paired clouds, so a revoked cloud approval can last until the next ten-minute check
  (or until a screen already open meets its token expiry). Closing that window fully needs the server.
- Pairing sessions cannot be told apart from the approver's session by anything but the token's
  `$auth`; a server that stopped sending `purpose`/`pairingId` there would quietly turn secondary
  devices into ordinary ones. The check also counts a guest with paired clouds, which a server change
  cannot hide.
- The relay ties a revoked pairing to the auth session that claimed it and from then on refuses that
  session's delegation into the cloud (`403 … pairing revoked`), its own invite included. Only a new
  auth session clears it, which the sign-out on an ended approval provides. The switch sheet recognises
  that refusal on a cloud that is not a paired one only by the relay's message text; a reworded message
  would leave such a switch failing quietly again. A paired cloud's recorded uid (the approver's) is
  forgotten when the cloud ends, so the invite's own uid is recorded again on the next entry.
- One ended approval signs the browser out of every paired cloud, not only the revoked one; the others
  need a new code.
- Dev's customer clouds do not answer `user.list-device` yet, so the device list shows an error there
  until they are upgraded.
- The `/pairings/**` wire types are a temporary copy in `@chatic/http` until
  `@lemoncloud/chatic-backend-api` publishes them.
- Every entry stays behind `feature.auth.devicePairing`. It was on in LOCAL and DEV only at first, and
  was turned on in PROD as well once the feature was opened to everyone; the key remains as the way to
  hide the screens again.

## Alternatives

- **One device per browser (device id and session in `localStorage`).** Rejected for now: it changes
  every browser sign-in, not just pairing, and moving only the device id lets another tab's guest
  connection take over the device's owner, so an unlink would close the wrong connection.
- **Let a browser's phone login approve too.** Rejected: the product asks the apps to approve; a
  browser that signed in by phone is easy to leave open on a shared machine.
- **Make the second phone an independent login** (a session with no pairing purpose). Rejected: it
  would hand over a whole account login for one code, and the approver could neither see nor end it.
- **Keep a browser's own invited identity when an approval names the same cloud.** Rejected: the
  approval would then change nothing the user could see, while its grant still stood — and revoking it
  later blocks the invite all the same.
- **Leave the browser a guest when a cloud approval ends** (drop only that cloud). Rejected: the relay
  goes on refusing the session's own invite into that cloud, so the browser is stuck until it signs out
  anyway, and a sign-in that outlives its approval is not what an approver who revoked expects.
- **Leave approvals standing at the approver's logout** and let the next renewal refuse them. Kept as
  the fallback only: revoking first closes a relay sign-in's connection at once instead of minutes later.
