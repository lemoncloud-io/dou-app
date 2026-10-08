# Auth

How a person gets signed in on desktop, and what the app refuses to take as a sign-in. The code is
`src/app/features/auth/`.

## Social login

"Continue with Google" (the Welcome page, or the Profile page for a Guest Session linking an
account) opens the OAuth Relay's authorize URL in the system browser, because Google refuses an
embedded Electron window. The relay returns to the hand-off page, `/auth/oauth-response`, which
opens `chatic://oauth?provider=&code=&nonce=` (`chatic-dev:` on the dev channel) to wake the app. The
app exchanges the code and replaces whatever session was on the device.

The Profile page offers the button to an account with no email, and it judges that from the relay
session, which is the account's. Inside a cloud the active session is that cloud's, whose user has
a uid and a name of its own and no email, so reading it there drew a signed-in account as a guest.
The Account card's name, email and user id come from the relay session for the same reason. The
"This place" card still falls back to the name the cloud knows, which is the one people there see.

The steps, in order:

1. **Register the device**, if there is no session yet (below).
2. **Record the start** — provider, time and a random nonce — in persistent storage.
3. **Open the browser** at the relay's authorize URL; the nonce rides its `redirect` address.
4. **The hand-off page** receives the code and the nonce and puts both on the deeplink.
5. **The app takes the deeplink** and exchanges the code only if the start record agrees (next section).

The deeplink carries a one-time relay code and the nonce — never a Google token and never a session,
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
"couldn't get you started" message. Cancelling in the browser therefore leaves the person with a
guest session. A code that comes back and fails to exchange is shown as a message rather than
dropped. The start record is used up by then, so the same link arriving again is refused as not
started; the way to retry is to tap Google again, which after a Welcome start is on the Profile
page, because the device is already registered.

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
  accepts a replayed code is not shown in this repository; its code is meant to be used once.
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
  that does not need it. The code being meant for one use bounds what that costs, and closing it
  needs the relay to bind the code to a challenge sent when the login starts. It is accepted for now
  because Google sign-in is on only in the dev channel.
- **A link that lands mid-sign-in.** Someone opening a link while the person is in the browser uses up
  the record. The real link then finds none and is refused; the person starts again. It costs that
  attempt and cannot complete one.
- **A sign-in that was started by a build before the nonce was sent** carries none and is refused
  once.
- **A relay that drops the nonce.** The nonce has to come back on the `redirect` address. If it does
  not, the hand-off page shows the failure screen on every sign-in — visibly, rather than letting the
  link through. A real sign-in on the packaged dev app (macOS) showed the relay returning it.

## Not on in production

`feature.auth.socialLogin` is off in production. Turning it on waits for three things: invited cloud
memberships following the account (the backend restores only the clouds a person owns), a real
sign-in confirming that the account is the same user as on mobile (the nonce round trip is confirmed
on the dev channel; the same user is not), and a decision on the scheme-claim risk above — accepted,
or closed at the relay.
