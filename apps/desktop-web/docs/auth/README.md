# Auth

How a person gets signed in on desktop, and what the app refuses to take as a sign-in. The code is
`src/app/features/auth/`.

## Social login

"Continue with Google" (the Welcome page, or the Profile page for a Guest Session linking an
account) opens the OAuth Relay's authorize URL in the system browser, because Google refuses an
embedded Electron window. The relay returns to the hand-off page, `/auth/oauth-response`, which
opens `chatic://oauth?provider=&code=` (`chatic-dev:` on the dev channel) to wake the app. The app
exchanges the code and replaces whatever session was on the device.

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
  and names the same provider. A nonce on the link, if there is one, must equal the record's.
- **A record is good once.** It is deleted when a deeplink reads it, whether the link is accepted,
  refused or expired.
- **A refusal says so.** Nothing is exchanged; the app logs the reason and shows a message that the
  link was ignored, or that the login expired and should be started again.
- **The link has to look right.** The scheme and host are compared as a parsed URL, not as a prefix
  (`chatic://oauth.evil` is not ours), and the provider must be one the flow knows. A link with no
  provider is refused rather than assumed to be Google.

The same check guards the hand-off page when the relay's return lands inside the app window.

### What this does not stop

A link opened within ten minutes of a login the person really started still passes, because the
nonce is not yet sent to the relay and so a link without one cannot be told from the real one. The
relay is outside this repository and whether it returns a value carried on the `redirect` address is
unconfirmed. Once a real login shows it does, three changes close the gap together: `start` passes
the nonce to `buildAuthorizeUrl`, the hand-off page forwards it into the deeplink, and
`evaluateOAuthDeeplink` refuses a link without one. The reasoning is in ADR-0009's amendment.
