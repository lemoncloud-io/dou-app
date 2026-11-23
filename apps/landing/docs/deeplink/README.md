# Deep links

How the bounce page reads and forwards links (`src/app/features/deeplink/`). The flow itself is in the app
[README](../../README.md#scenarios).

## Forwarding to the web (`useWebRedirect`)

- The invite branch of `/s` needs a `code`. The gate on `/s` keeps any other page that happens to carry a `code`
  parameter, an OAuth callback most obviously, out of the invite branch.
- On `/s` a missing address means relay: the relay server has no address to carry, so the `relay` flag is optional on the
  way in, and the redirect always emits an explicit `relay=1`. Requiring an address or the flag there silently rejected
  code-only relay links, which then fell through to the "unsupported deep link" dead end.
- The encoded `/i` link is handled first and by different rules: it carries an explicit relay flag and must not inherit
  the `/s` inference. A link that is ours but unreadable is a dead end like an unparsed `/s`; the console says so and
  nothing else happens.
- An encoded link with neither relay nor backend is handed on with neither parameter, not guessed at: reading it as relay
  would send the invitee to the wrong server, and the web owns the decision about where an address-less invite lands.

## Launching the app (`useAppLauncher`)

- The store-dialog timer is deliberately not cleared on unmount. React's development double mount unmounts and remounts
  once, the once-only automatic launch does not run again, and a cleared timer would leave the spinner up for good. A
  timer firing after a real unmount only sets state React discards.
- A page that went to the background during the launch means the app opened, so the store is not offered on the way back.
