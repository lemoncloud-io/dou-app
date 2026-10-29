# Auth

How a person gets signed in on desktop, and what the app refuses to take as a sign-in. The code is
`src/app/features/auth/`.

## Social login

"Continue with Google" (the Welcome page, or the Profile page and the account hub for a Guest Session
signing in to an account) opens the OAuth Relay's authorize URL in the system browser, because Google refuses an
embedded Electron window. The relay returns to the hand-off page, `/auth/oauth-response`, which
opens `chatic://oauth?provider=&code=&nonce=` (`chatic-dev:` on the dev channel) to wake the app. The
app exchanges the code and replaces whatever session was on the device.

The exchange is signed with that session. It goes to the relay's `verify-oauth-code`, which records the
Guest Session's user as the new session's link — the same record the mobile sign-in leaves — so the
account can still enter the clouds the guest was invited to. The endpoint refuses a call with no
session, which is why the device is registered before the browser opens (below), and why nothing
between the start and the exchange may clear the session.

The Profile page offers the button only when the relay user's `userRole` is `guest`, and it judges
that from the relay session, which is the account's. Inside a cloud the active session is that
cloud's, whose user has a uid and a name of its own, so reading it there drew a signed-in account as
a guest. An account with no email is not a guest: one that signed up with a phone number has none.
The Account card's name, email and user id come from the relay session for the same reason. The
"This place" card still falls back to the name the cloud knows, which is the one people there see.

Every place that offers the button says, under it, that someone who signed up on mobile with a phone
number gets a new account from it unless Google is linked to that account. Where phone-number
sign-in is on, the note sends them to sign in with the number and link Google from the account hub;
where it is off, it sends them to the mobile app. Sign-in is not linking: signing in with Google while
signed in to another account opens a session as the Google account's owner (the server keeps it that
way, as on mobile). Linking is its own button ([Linking Google](#linking-google)). Recovering someone
who already landed in a new account is out of scope.

The steps, in order:

1. **Register the device**, if there is no session yet (below).
2. **Record the start** — provider, time and a random nonce — in persistent storage.
3. **Open the browser** at the relay's authorize URL; the nonce rides its `redirect` address.
4. **The hand-off page** receives the code and the nonce and puts both on the deeplink.
5. **The app takes the deeplink** and exchanges the code only if the start record agrees (next section).

The deeplink carries a relay code and the nonce — never a Google token and never a session,
and the app holds no Google client secret. The Desktop-type loopback route that would put the token
in the app was tried and Google refuses its token exchange without a secret, which a shipped binary
cannot keep (ADR-0178).

### Which app the hand-off opens

The scheme follows the stage: local and dev builds open `chatic-dev:`, production opens `chatic:`.
The registry decides (`net.deeplink.desktopProtocol`), with no build variable. It is the axis the
shell uses for its own scheme — the dev channel registers `chatic-dev:`, the production channel
`chatic:` — so a dev sign-in never wakes an installed production app. The one pairing where the two
disagree is an unpackaged dev shell pointed at the production web: the shell registers `chatic-dev:`
and the page opens `chatic:`.

The device is registered first. The backend's sign-in contract expects a device session,
so tapping Google with no session registers the device (the same registration as the guest start)
before the browser opens, and a registration that fails stops there with the Welcome page's
"couldn't get you started" message.

That registration flips the router to its signed-in branch while the browser is still open. Left
alone, the person would land in the app as a guest they never chose. So the attempt is kept in an
in-memory store (`useOAuthAttemptStore`) from before the registration until the code comes back, and
while an attempt begun signed out is pending the router keeps `/auth/welcome`, which shows a waiting
card instead of the buttons:

- **Open the browser again** sends it to the same authorize URL with the same nonce, for a tab that
  was closed. No new record is written.
- **Sign in with phone number** drops the start and moves to phone sign-in, keeping the device
  session that phone sign-in needs anyway.
- **Cancel** drops the start record, so a tab finishing later is refused, and signs out the guest
  the start registered, which reloads to Welcome. A session that was there before the start is never
  signed out.
- A hand-off that fails, or a start that runs past its ten minutes, turns the card into a retry.

Two moments have no way out on the card. While the device is still being registered the browser has
not been sent, and a cancel then would leave the guest the registration is about to make. While the
code that came back is being exchanged, a cancel would race the exchange: the sign-out and the
sign-in would both replace the session. Both are seconds long, and both end the card by themselves.
The hub's inline card holds back its cancel at the same moments. A start dropped while registering
regardless does not send the browser once the registration finishes.

The hand-off page in the system browser does not offer a way "back to the start" when it fails: that
would open a second copy of the app in the browser tab. It says to go back to DoU and links
`chatic://open` (the stage's scheme), which only raises the app window, where the card offers the
retry. Inside the shell the page still goes back to Welcome.

The account hub's guest Google button and Link Google wait the same way, inline on the card, and stay
disabled while an attempt is out: a second start would overwrite the first one's nonce and the open
tab would come back refused.

### After the sign-in lands

The app says who the person signed in as. The sign-in leaves a one-shot notice in storage (it
reloads when it replaces a session) and the signed-in shell takes it once:

- **An existing account** gets a toast with its name, once the relay connection is verified as that
  account.
- **A new account** gets a stop that cannot be dismissed by Escape or a stray click: the Google had no
  DoU account, so someone who signed up on mobile with a phone number has just made a second one. It
  asks for a display name (skippable) and offers to log out of it.

The notice is taken out of storage when the app loads, so the first render of the signed-in app
already knows a new account is waiting. The first-run tips hold back until the stop is answered;
opened together, the tips sat over "not my account".

The server does not say whether the sign-in made the account. The app reads it off the account's
`createdAt`: an account created at or after the moment the sign-in started, less a minute of slack for
a server clock that runs behind, was made by it. A Google that already owned a DoU account was made
long before. Without a `createdAt` nothing is claimed and the toast is shown. The reading leans on this
machine's clock: one running ahead of the server by more than the slack plus the time spent in the
browser reads a new account as an existing one, which loses the stop but never invents one. A notice
not yet said when the person logs out is dropped with the rest of the account's storage.

### Invites and logout for a signed-in account

Because the sign-in links the Guest Session rather than replacing it, the signed-in account keeps the
guest's id (`delegatorId`) and still stands on that guest's invite grants. Two things follow from it.

- **It can join a cloud by invite** (ADR-0209). The invite exchange (`/oauth/login-invite`) does not check who
  is calling: it links the invited cloud to the guest id it is given, and when the account later
  switches into that cloud the relay follows the session's link back to the original guest and lets
  it in by invite. So the profile menu offers "Join with invite" to a guest and to any account that
  holds a guest id. An account without one — signed in without a guest on the device first — has
  nothing to join under; the join dialog refuses it after the code (`loggedIn`), and the menu hides
  the item from it.
- **A refused invite says why.** The join dialog and the invite page show a sentence by the
  refusal's kind and, under it, the server's own words (`400 INVALID - grace-timeout by invite[…]`
  for an invite past its window); the same pair goes into an error toast that rises over the
  dialog. See `docs/shell/failure-toasts.md`.
- **No logout takes the invited clouds** (ADR-0245). After the reload the device registers back into
  the same guest, which still holds the grants, so messages from those clouds keep arriving. That is
  as true after a guest logs out as after an account does: the device id is fixed per install, so the
  next "Start chatting", sign-in, or sign-in the person backs out of registers the same guest again.
  The rail can list an invited cloud only from the cloud cache's invited rows and the joined-clouds
  store — the relay catalog never carries one, and there is no server list to rebuild them from. The
  account reset used to wipe both, which emptied the list until a push re-cached one cloud at a time.
  It now keeps both on every logout, as apps/web does, and still clears the rest of the cloud cache
  (owned clouds' names belong to the account).

The join entry reads the role from the relay token (`isRelayGuest`), not from `useRuntimeProfile`:
inside a cloud the active session is that cloud's user, and its role says nothing about the account.
No relay user counts as a guest, as on the account hub.

## Joining with an invite link

A signed-out person who installed the app without a link lands on Welcome, where "I have an invite
link" is the first and only filled button. It opens `/auth/login`, which is one card in three steps,
shown as three dots above the heading. Each screen slides in; the card around it stays put.

1. **Paste.** The link or code goes in a large field at the middle of the screen. Pressing Continue
   parses it, refuses an untrusted backend, and looks the invite up. Nothing is joined yet.
2. **Preview.** The card names the place and who invited the person, read from the lookup. A bare
   `invt:` code names no backend, so there is nothing to look up and the card says it has no details;
   joining is still allowed. Join exchanges the code.
3. **Entering.** The exchange runs; on a refusal the card returns to the preview with the reason.

The lookup is signed, so it needs a device guest session, and the preview is where that session is
made: before the person has joined anything. The preview blocks an invite whose lookup is rejected or
whose state is one of four — `accepted` reads as already used, `expired` as expired, `canceled` and
`rejected` as no longer available — with the same sentences the exchange uses. A state the list does not
name, or none at all (an older backend), is read as pending. An invite still marked pending whose
`expiredAt` has passed is read as expired too; an `expiredAt` of 0 or none means no expiry was set.

What the dev backend was seen to do, which the preview cannot change: it does not move an invite to
`accepted` when it is exchanged, so a link stays pending and joinable until `expiredAt` (a day after
it was made), and the preview cannot tell a link that was already used from a fresh one. An invite
made for a phone number also signs the person in as the account of that number, not as a guest;
the preview only knows the guest session it made itself, so that is the moment the identity changes.

The guest session flips the router to its signed-in branch, so the page state (step, preview, the
pasted code, whether the preview registered the guest) lives in `useInviteLoginPageStore`, and its
`held` flag keeps `/auth/login` mounted until the person leaves or finishes. Two rules follow from that
session existing before the person has agreed to anything:

- **Leaving signs out a guest the preview made.** Back from the paste step signs that guest out, which
  reloads to Welcome; without it the signed-in router would drop the person into the app as a guest
  they never chose. A session that was there before the page opened is never signed out. The device id
  is fixed per install, so a later start registers the same guest again; backing out creates no extra
  account.
- **Back is withheld while the lookup runs.** The guest is not yet known to the page then, and leaving
  would release the hold before it could be signed out. The lookup is seconds long and ends by itself.
  An answer that arrives after the page was left is dropped (each preview carries an attempt number,
  and leaving advances it).

The connection banner stays off while the page is held, because the guest's socket is still coming
up and nothing on the page uses it; a lost network is still reported there.

Quitting or reloading the app during the preview is not covered: the page state lives in memory, so
the next start finds the guest the preview registered and opens the app as that guest.

The in-app "Join with invite" dialog is a different path: it already has a session, shows no preview,
and still goes straight to the exchange.

## Linking Google

A signed-in account (not a guest) with no social account linked gets **Link Google** on the account
hub ([account](../account/README.md#how-the-account-signs-in)). It runs the same browser round trip
as a sign-in, with two differences:

- **No device registration.** There is a session already, and the button is only offered with one.
- **The start record says `intent: link`.** When the deeplink (or the hand-off page inside the app)
  comes back and the record agrees, the code is not exchanged for a session. It goes to
  `auth.link-account` as `{ type: 'social', mode: 'link', provider, code }`, first with
  `step: 'verify'`, then with `step: 'confirm'`. The relay code is good for repeated checks for 30
  minutes from the start, so both steps carry the same code. Verify is the step that says why a
  link is refused (`linkable: false` with a `reason`); confirm answers the same cases with a status.

The session does not change, so nothing reloads. The server's answer (provider and hint) is patched
into the relay user's `link$`, so the hub shows Google straight away; the next relay verification
reads the profile again. Whether the code arrives by the deeplink or lands in the app window (the
hand-off page inside the shell), the app goes back to the account hub once the link has run, whatever
its outcome.

What the person is told:

| Answer                                    | Where              | What                                                                                                                         |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| linked                                    | toast              | Google is now linked                                                                                                         |
| verify `reason: occupied`, or confirm 409 | sign-in card, kept | that Google already belongs to another DoU account, and that signing in with it opens that account; merging is not available |
| verify `reason: type-linked`              | sign-in card, kept | this account already has a social account linked                                                                             |
| anything else                             | sign-in card, kept | the link failed, try again                                                                                                   |

A refusal stays on the card until dismissed: a toast is gone before someone back from the browser
looks, and the occupied case needs its next step read.

The intent is read off the record, never off the link, so a link cannot turn a login into a link or
the other way round. A record written before intents existed, or one whose intent cannot be read, is
a login. If the account is no longer signed in (or has become a guest) by the time the code comes
back, or another account is signed in than the one that pressed the button (the record keeps its
relay user id), nothing is sent and the link is reported as failed. A 403 from confirm is reported
as a plain failure: it can also mean the session is not a main user, and only verify names the
`type-linked` case. The button is behind the same switch as
Google sign-in (`feature.auth.socialLogin`).

## A deeplink is taken only for a login this app started

Any web page, document or app on the machine can open a `chatic://` link, so a link that arrives
says nothing about who began the login. Taking it anyway would sign the person in as whoever owns
the code in it.

- **Starting records it.** Before the browser opens, `start` writes a record to the app's persistent
  storage: the provider, the time and a random nonce. It is persistent because the app is often quit
  while the person is in the browser and relaunched by the deeplink.
- **A deeplink needs the record.** It is exchanged only if a record exists, is under ten minutes old,
  names the same provider, and the link carries the nonce the record holds. A link without a nonce
  is refused, even with a fresh record waiting.
- **A record is good once.** It is deleted when a deeplink reads it, whether the link is accepted,
  refused or expired.
- **A refusal says so.** Nothing is exchanged; the app logs the reason (never the code or the nonce)
  and shows a message that the link was ignored, or that the login expired and should be started again.
- **The link has to look right.** The scheme and host are compared as a parsed URL, not as a prefix
  (`chatic://oauth.evil` is not ours), and the provider must be one the flow knows. A link with no
  provider is refused rather than assumed to be Google. A link with no nonce still parses, so the
  refusal above is shown to the person instead of the link being dropped silently.
- **The hand-off page stops too.** A page that arrives without a nonce shows the failure screen and
  does not open the app.

The same check guards the hand-off page when the relay's return lands inside the app window.

### What each check stops

- **The nonce on the link** stops a link someone opened on the machine with a code of their own. It
  does not stop a party that can read the real link.
- **A record used up by the first link** stops the same link being used twice here. Whether the relay
  accepts a code that was already exchanged is not shown in this repository, so nothing here relies
  on it refusing one. The same link sent again is ignored without a word: the app keeps the nonces of
  its last five starts (`chatic-oauth-used-nonces`), so a repeat is told apart from a link it never
  started, and it does not use up a newer start that is waiting. A repeat is what a browser tab left on
  the hand-off page sends when it is reloaded or restored; the page itself also opens the app only
  once per nonce (`sessionStorage`), and keeps the button for a second try.
- **A record that lives only where the login started** means a link arriving on another device or
  installation finds none, and the exchange is sent from the device that started it.
  That is as far as it goes: this repository does not show that the server refuses a different
  device, so nothing stronger is claimed.
- **Ten minutes** stops a link from a login long abandoned, not one inside the window that carries
  the right nonce.

### What this does not stop

- **Another app that claims the protocol scheme.** The operating system routes `chatic-dev://` (or
  `chatic://`) to one app. If a different app on the machine is the one that gets the link, it
  receives the code, and nothing in this repository keeps it from exchanging that code itself: the
  nonce is checked only inside this app and never reaches the server, so it proves nothing to a party
  that does not need it. Nothing here bounds what that costs. Closing it needs the relay to use a code up on its first
  exchange and to bind it to a challenge sent when the login starts. It is accepted, with
  Google sign-in on in production; see "On in production".
- **A link that lands mid-sign-in.** Someone opening a link while the person is in the browser uses up
  the record. The real link then finds none and is refused; the person starts again. It costs that
  attempt and cannot complete one.
- **A sign-in that was started by a build before the nonce was sent** carries none and is refused
  once.
- **A relay that drops the nonce.** The nonce has to come back on the `redirect` address. If it does
  not, the hand-off page shows the failure screen on every sign-in — visibly, rather than letting the
  link through. A real sign-in on the packaged dev app (macOS) showed the relay returning it.

## Phone-number sign-in

"Sign in with phone number" (the Welcome page, and the account hub for a Guest Session) opens
`/auth/phone`. It is the way into an account someone made on mobile with a phone number. On both
screens it comes before "Continue with Google" and carries more weight (a filled secondary button against
Google's outline; in dark the secondary fill is near-black, heavier than the lime primary, so it takes
the lifted grey there): a phone sign-up who reaches for Google first gets a second, empty account. The order
only steers; nobody is stopped from using Google. The page
runs `usePhoneLogin` over the `auth.link-account` packet in `login` mode, the same packet the mobile
app's phone sign-in uses:

1. **Send** — the number goes out in E.164 with its country. Sending registers the device first when
   there is no session, because the server takes a login only from a device session. The code goes
   over the relay socket, so the send then waits (up to 10 seconds) for that socket to authenticate the
   new device; sent before the handshake ends, the first send failed and only a second press got a text.
2. **Confirm** — typing the sixth digit confirms. There is no separate verify step: it would only say
   the code is valid, which the confirm proves anyway.
3. **Switch** — the confirm's `$token` becomes the session, and the app reloads at `/` so the socket,
   caches and cloud rail start over as that account (the same as a Google sign-in that replaces a
   session).

What it refuses and what it says:

- **An account that is already signed in** is sent home: the server refuses `login` from anything but
  a device session. The page judges that once, on arrival, since the sign-in itself turns the session
  into an account.
- **A number with no account** gets one: the server answers that only on the confirm (`isNew`), after
  it has made the account. The page says so before the app opens, so someone expecting their mobile
  account notices, and asks for the new account's display name (skippable; a failed save offers to
  carry on without it). The name waits for the relay connection to sign in as the new account.
- **A malformed number** is told why: the button opens as soon as anything is typed, and asking for a
  code checks the number first.
- **Errors** are read off the socket status, never the wording: on a first send 429 is the daily cap;
  on a resend 429 is the one-minute cooldown; on the confirm 403 is a wrong code, 429 too many wrong
  codes and 400 an expired code.
- **A switch that fails after the confirm** keeps the token and offers to finish; the retry re-applies
  it and never spends the code again.

Around the form:

- **Resend** is shut for the minute the server enforces between sends and counts it down; a resend
  refused with 429 restarts the wait.
- **The country** opens on the last pick, then on the country the UI language implies (a Korean UI
  opens on Korea even on an English OS), then on the OS locale's region.
- **Back** returns to where the page was opened from (Welcome or the account hub). A guest that this
  visit registered — by sending the first code, or by a Google start that moved here — is signed out
  on the way, which reloads to Welcome: backing out is not choosing to be a guest.

The route is registered on both sides of the router's signed-in switch, because the registration in
step 1 flips it while the form is open. There is no development bypass code on desktop; a code
always arrives by text. The number and the code stay in the request body and are never logged.

## Sign-in with another device

In a plain browser, where device pairing is on (`feature.auth.devicePairing`, off by default), Welcome
also offers **Sign in with another device**: the browser shows a code that the signed-in desktop or
mobile app approves. Like phone sign-in it registers a guest first and holds its page across the
router's switch. The flow, the approving side and the device list are in
[pairing](../pairing/README.md).

## On in production

Both `feature.auth.socialLogin` and `feature.auth.phoneLogin` are on in every build, production
included. They stay `server`-writable, which is the declared way to turn one off without a release
once a remote lane is wired; until then rolling back is a one-line registry change and a web deploy.

Google was held to the dev channel until three things were known. Two were shown on the dev channel:
a guest invited to a cloud signed in with Google and could still enter the cloud, and a Google account
linked on mobile signed into that same account. The third, another app claiming the protocol scheme
(see "What this does not stop"), is not closed: it is accepted, and closing it is relay work, a code
used up on its first exchange and bound to a challenge sent when the sign-in starts.

Phone sign-in was held for the same invited-cloud question. On the dev channel a guest who joined a
cloud by invite signed into an existing account by phone and could still enter the cloud after a
reload.

The invited cloud follows the guest session that signs in, not the account for good: the same account
signed in later from a fresh guest did not list it. Mobile sign-in leaves the same link record.
