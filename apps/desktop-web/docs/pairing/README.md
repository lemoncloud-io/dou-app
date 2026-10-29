# pairing

Device pairing (`src/app/features/pairing/`): a browser signs in by showing a code that an app which
is already signed in approves, and the account sees and ends what it approved. Everything here is
behind the `feature.auth.devicePairing` registry key; with it off no entry point is drawn and no
route exists.

| Route                       | Page                 | Where it runs                                   |
| --------------------------- | -------------------- | ----------------------------------------------- |
| `/auth/pair`                | `PairingCodePage`    | a plain browser — the requesting side           |
| `/settings/pairing/approve` | `PairingApprovePage` | the desktop app — the approving side            |
| `/account/devices`          | `DevicesPage`        | any signed-in account that is not a relay guest |

Which side a client is follows from where it runs. A plain browser (`!isNative()`) requests: the
desktop app signs in on its own and has nothing to borrow. The desktop app approves when it is signed
in to an account — approving hands on a sign-in, and a guest holds none of its own — and its session
did not come from a pairing (`useIsPairedSession`): a session that was lent access does not lend it on.

## The code screen (`/auth/pair`)

Reached from **Sign in with another device** on Welcome. It shows an 8-digit code read as two groups
(`0734-4168`), a QR code of the bare digits, the time left, where to approve it (Settings › Approve
web sign-in), and the browser's own name as the approving app will show it, so the person can check
that what they approve is this tab.

The relay accepts a code request from a guest session only, and a browser on Welcome has no session.
So the page runs in two phases:

1. **Signed out**, it signs in as a guest (the same device registration as Welcome's guest start) and
   shows a spinner, or the failure with a retry. Before that sign-in it takes a hold
   (`usePairingCodePageStore`), because the sign-in flips the router to its signed-in branch, where
   `/auth/*` otherwise redirects home. While the hold stands that branch keeps `/auth/pair`.
2. **Signed in as that guest**, it asks for the code. The branch flip remounts the page, so the code
   request is mounted only in this phase; mounted in the first, it would be asked for twice.

The ends: an expired code is struck through with **Get a new code**; a declined request, a sign-in
that could not finish, and a code that could not be had each say so with a way to start again.
Approved, the page says what it signed in as — the approving account by name for a whole-account
approval, the cloud for a cloud approval — opens the app and lets go of the hold.

Leaving before that goes back to Welcome. The guest the page registered is signed out on the way
(which reloads), so backing out does not leave the person in the app as a guest they never chose.
The hold stays until that sign-out has run, and the page shows only a spinner meanwhile: the
sign-out drops the session before it reloads, and the page would otherwise start over.

An account that is already signed in is sent home from the page; it has nothing to pair.

## Approving (`/settings/pairing/approve`)

Reached from **Approve web sign-in** on Settings, beside the Account entry (the code screen names
that place), and from the approved sign-ins section below.

The field keeps the digits of what is typed or pasted (`0734-4168`, spaces), at most eight, and
looks the code up once it has all eight. Each code is looked up at most once per visit: the lookup is
the relay's record that this account saw the code, and a second lookup only earns a refusal. Typing
the same code back shows what the first lookup said; only a lookup that failed without a reason from
the relay (the network) is tried again.

The request is then shown as a card: the browser's name (or "unknown browser"), whether a phone or
a browser is asking, the time left, and to approve only the browser the person just opened. A
developer-tool request (`purpose: debug`) also says that it issues a token with every permission on
the account, and approval stays off until the person ticks that they started the tool themselves.

What the browser may use is a choice:

- **My whole account** — the relay. (A relay guest never reaches this page, and the relay would refuse
  a guest approving its own session anyway.)
- **One cloud** — one option per cloud in the relay catalog (the owned clouds).

The choice starts where the account is working: the active cloud, or the whole account on the relay.
With no option at all the page says there is no account to approve with and offers only
**Decline**. Approve and decline each end with a toast and return to where the page was opened.
Refusals are told apart (`classifyPairingError`): an unknown code, an expired one, a code this
account may not approve, a target it may not approve for, and a request already handled.

## Devices (`/account/devices`)

Reached from **Devices** on the account hub; hidden from a relay guest.

**Devices** lists the account's devices (`user.list-device`) on the active slot — inside a cloud,
that cloud's devices, headed as such. Each row has the name (`runtime.session.deviceDisplayName`: a
phone or the desktop app saves no name, so its stored user agent reads as `iPhone`, the OS, or
`<browser> · <OS>`), the kind (phone, desktop, browser,
developer tool, or unknown), and "online" or the last activity. The device in use is marked and is
never offered for unlinking; it is signed out with logout. Unlinking asks first, and inside a cloud
the confirmation adds that a browser let in by a cloud approval also has to be unlinked under
approved sign-ins. A list the slot refuses (some clouds do not serve it) is an error with a retry.

**Approved sign-ins** is drawn only where the device can approve. It lists the approvals still in
force (`GET /pairings`, status `approved`): the browser, a developer-tool mark, the scope, and when it
was approved and signed in. A whole-account approval never signed in is flagged as not signed in,
with unlinking recommended — it is a session waiting for whoever holds that browser. A cloud approval
has no such sign-in to wait for and never carries the flag. Unlinking asks first, saying what it
does: a whole-account approval ends the browser's sign-in at once; a cloud approval stops it coming
back, but a screen already open in that cloud can last up to 30 days unless the device is also
unlinked in that cloud's device list.

## Signing out, and paired clouds

**Signing out of an approving app.** The account menu's logout and a release of the active cloud in
`CloudHubPage` go through `runtime.session.usePairingAwareLogout` while the flag is on. When this app
approved web sign-ins that still stand, `components/PairingLogoutDialog` lists them (requester and
scope, plus a caveat when a cloud approval is among them); confirming revokes them all and then runs
the ordinary account reset and logout. With nothing approved, in a browser, on a secondary device, or
when the list cannot be read, the logout happens at once. Releasing the active cloud is the one case where
the logout is not the person's to cancel — there is no cloud left to stand in — so cancelling that confirm
only keeps the approvals standing, and the reset and logout still run. The dialog mounts only while a confirm is
open, so a menu that never signs out never reads the cloud catalog.

**Paired clouds.** A browser that a phone approved into one cloud stays a relay guest; the runtime keeps
that cloud in its paired-cloud list. `DesktopRuntime` runs `usePairedCloudSignOut`
(`runtime/usePairedCloudSignOut.ts`) over `runtime.session.usePairedCloudCheck`, which re-issues each
paired cloud through the relay's delegation at mount, every ten minutes and whenever the window becomes
visible again — a browser left in the background would otherwise show a revoked cloud until the next
ten-minute round; a 403 (the
approval was revoked, or the approver signed out) tears the cloud down, a toast says so, and the
browser signs out (account reset, then logout) — the approval was its sign-in, and the relay refuses
the same auth session's way back into the cloud until a new session replaces it. desktop-web
has no switch-list entry for a paired cloud yet — apps/web's cloud sheet has one — so a browser that
leaves the cloud it was approved into cannot pick it again without a new code.
