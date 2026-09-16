# phone-verification — proving a number, in two shells

A relay 1:1 invite may only be issued and accepted by the owner of a phone number. A device user
(guest) is refused `invite.create` and `invite.accept` with a 403, so there has to be a place where
proving a number **promotes** that session to the number's main user. A main user who signed up
socially and has no number uses the same place to **link** one.

One state machine covers both, and two shells present it. The packet underneath is
`auth.link-account`; its modes, steps and wiring belong to
[account-linking.md](./account-linking.md). This document covers the **screens** and the session
switch that follows a successful login-mode proof.

## Layout

Number parsing and validation are **not** in `features/auth/utils`. The machine imports
`apps/web/src/app/utils/phoneNumber.ts` (`toE164`, `isValidMobileNumber`, `readInternationalInput`,
`resolveDefaultCountry`, `rememberCountry`) — see
[international-phone-input.md](./international-phone-input.md).

A shell holds chrome and nothing else. Adding or removing one changes no behaviour — which is the
property that let a fourth consumer (`AccountLinkSection` in mypage) appear without touching the
machine, alongside the accept screen, the issue form and the login screen. `PhoneVerifyFields` has a
fifth consumer outside this feature: the subscription email dialog reuses the same field pair.

## Responsibilities

`usePhoneVerify` owns everything that can fail: validation, the outstanding code, the countdown, the
resend cap, error copy, and the session switch. It returns `{ fields, submit }` — `fields` goes
straight into `PhoneVerifyFields`, and `submit` (`isRetry`, `disabled`, `loading`, `onSubmit`) is
drawn by each shell in its own position.

It refuses to decide chrome. `onClose` and `context` are shell props and never reach the machine's
own options.

## The shared contract

### The two modes take different routes

`mode` is required, with no default, and the caller derives it from the session role.

| `mode`    | Steps taken                         | Ends with                                  |
| --------- | ----------------------------------- | ------------------------------------------ |
| `'login'` | send → **confirm** (verify skipped) | `$token` installed, then `onVerified`      |
| `'link'`  | send → **verify** → confirm         | the credential attached, session untouched |

On `login`, `verify` would only report that the code is valid, which `confirm` proves anyway — so
the code field confirms as soon as six digits are in. On `link`, `verify` is the only step that will
say confirming is blocked, so the code field verifies and the CTA confirms.

### The send is pinned

The `{ phone, country }` a code was sent with is stored at send time, and the prove steps read
**that**, never the live field. The server requires the same country on send and on proof, and
reading live state made that correctness depend on never missing an invalidation.

Retyping the number or changing the country invalidates everything outstanding: the expiry, the pin,
the entered code, and the `link` verdict — which was about the old number. A resend goes to the pin,
because a resend is a new code for the _same_ number.

### The wire form is E.164

`toE164(phoneInput, country)` is what goes out. The backend's phone hasher only reads `countryCode`
on a local (`0…`) number and ignores it once the string starts with `+`, so E.164 is the one form
that is right whether or not `countryCode` is trustworthy. `countryCode` is sent alongside anyway —
it is what the documented contract names, and it costs nothing.

### `last4` is checked before the send

In an accept flow the invite carries the last four digits of the invited number. A mismatch is
rejected in the field, without a round trip, because a delivery spent on a typo counts against the
day's caps.

Four digits are not a verdict — the server re-checks the whole number — so the 400 branch stays. The
comparison is deliberately country-blind: last-4 across countries only ever over-reports a match, and
the invite carries no country of its own.

### One status code, several meanings

Every branch reads `getSocketErrorCode`. The raw failure is always logged first, because most of
these statuses cover more than one condition and the server's own message is the only thing that
separates them.

| Step           | Code | Copy                    | Why that reading                              |
| -------------- | ---- | ----------------------- | --------------------------------------------- |
| send           | 400  | `inviteMismatch`        | only when the invite code actually rode along |
| send           | 429  | `tooManyRequests`       | a first send tripping 429 is the daily cap    |
| resend         | 429  | `cooldown`              | mid-flow, 429 is the 60-second cooldown       |
| verify/confirm | 403  | `wrongCode`             | the usual reading                             |
| verify/confirm | 403  | `linkTypeAlreadyLinked` | when a `verify` just accepted this very code  |
| verify/confirm | 429  | `attemptsExceeded`      | five wrong answers                            |
| verify/confirm | 400  | `codeExpired`           |                                               |
| confirm        | 409  | `linkOccupied`          | `link` only — the number is someone else's    |

The 403 pair is the subtle one. A wrong OTP and "you already linked a different number" arrive as the
same status; the machine disambiguates with a flag set only when a `verify` just vouched for this
code, at which point a wrong OTP is no longer the likely reading.

The three 429s are told apart by **call site**, not by the response: first send is the daily cap,
resend is the cooldown, prove is the wrong-answer limit.

### Resend, extend, and the cap

The backend has no "extend the timer" concept. Both the resend control and the extend control send
`step=resend`, which issues a fresh code and a fresh `expiredAt` — and does **not** reset the
wrong-answer counter, which the resend toast says out loud.

A client-side cap of five stops the call before the server is asked, and raises a dialog whose copy
depends on which control was pressed. The buttons are not disabled: a dead button cannot explain
itself. A server 429 arriving before the cap always wins.

### Expiry is the server's value

The countdown renders `expiredAt` from the send response. No validity window is hard-coded. At zero
the code field goes to an error state and submission is disabled; only a resend recovers.

### The session switch, and why it is guarded twice

`mode: 'login'`'s confirm returns a `$token`, and `runtime.session.applySessionToken` installs it
**before** `onVerified` fires, so the caller's next `invite.create` or `invite.accept` runs on a
connection that is already the main user. It commits the token to the session store, re-registers the
relay socket in place (`logout()` then `register()`, no reconnect), and waits for `ready()` against a
10-second deadline — with a check on each side of the commit.

- **An empty `$token` is a no-op.** That is what a `link` confirm returns, so the path is simply not
  taken there.
- **The pre-condition runs before the commit.** Without `$auth.id` the relay socket cannot
  re-register, and committing anyway would leave HTTP signing on the new identity and the socket on
  the old one.
- **The post-condition exists because two silent successes compose into a lie.**
  `reauthenticateActiveSocket` returns quietly when there is no registration to read back, and
  `ready()` resolves instantly on a socket still authenticated as the _previous_ identity. Together
  they report success on a connection that is still the device user, and the caller's next
  `invite.create` answers 403. Comparing the controller's token to the one committed is what catches
  it.
- **The store leads and the socket follows.** The React-side reauth binder observing the same token
  change converges to a no-op through its token-equality guard.
- **Only the relay slot is touched.** An active cloud session keeps its own delegated identity.
- **No relay slot bound is not a failure.** The committed token is the source of truth and the next
  bootstrap registers it.

The identity swap has to be `logout() → register()`. The SDK's `refresh` and `switch` re-sign the
**same** identity, so neither can carry another user's token.

If the switch fails, the OTP is already spent. The machine keeps the token, shows a switch-failed
error and flips the CTA to a retry that re-runs the **switch**, never the consumed check.

## Usage

### Driving a shell

The caller passes `mode` — the accept flow is always `login`, since the session opening a deeplink is
a device user, and mypage linking is always `link` — plus `onVerified`, `onClose`, and in an accept
flow the `inviteCode` and `inviteLast4`. `context` picks the hero copy and only the full-screen shell
takes it, because only that shell has a hero.

### Gating an entry point

`ContactInvitePage` shows the verification prompt instead of the issue form when either
`runtime.session.useRuntimeProfile().isGuest` or `useLinkedAccounts().phone === 'absent'` holds, and
opens the sheet with `isGuest ? 'login' : 'link'`.

`'unknown'` does not trigger the gate. Reading it as "no number" would ask a user who already owns
one to prove it again; the fall-back is `isGuest` alone.

A 403 from `invite.create` opens the same sheet as a fallback, at most once per visit — 403 also
covers withdrawn and suspended accounts, for which verifying resolves to the same user and would 403
again. After a successful verification the sheet just closes: the form's input is still there and
the user presses the CTA again. Nothing is auto-resubmitted, which would run on a stale closure.

### What not to do

- **Do not put logic in a shell.** The shells are interchangeable precisely because they hold none.
- **Do not read the live field in a prove step.** Read the pin.
- **Do not hard-code a validity window.** Render `expiredAt`.
- **Do not parse an error message.** Branch on the code, and log the raw failure either way.
- **Do not skip `verify` in `link` mode**, and do not run it in `login` mode.
- **Do not treat the client resend cap as the limit.** It is a courtesy ahead of the server's 429.

## Notes for implementers and tests

- **The account-split banner is full-screen only.** The warning is mandated on the accept screen, and
  the issue-side design leaves it out. It hides itself when `social === 'linked'` and **stays up on
  `'unknown'`** — showing it to someone who did not need it is the honest failure, since an
  unmergeable account is not recoverable. It owns its own outer padding so the surrounding `gap-8`
  does not leave a hole when it hides.
- **The banner routes through `useNavigateToLogin`**, closing the verification flow first so the
  dialog is not left mounted under the login page. See the login-return section in
  [README.md](./README.md).
- **Phone login on the mypage login screen is dev-only**, behind `isDevBuild()`
  (`apps/web/src/app/utils/buildEnv.ts`). Social sits above it, because an account split happens in
  one direction: proving a number first on a fresh device mints the separate user. That screen uses
  inline copy rather than the banner — it _is_ the banner's destination.
- **There is a dev bypass code.** It is not a client-side skip: it goes through the same calls and
  the server decides, so a release backend rejects it as a wrong code. Nothing can be forged, because
  the `$token` comes from the server.
- **Dev delivery switches omit rather than negate.** Receiving over Slack means `{ slack: true, sms:
false }`; an unset switch is left out so the server default survives.
- **Logging out returns the same device user.** `applySessionToken` never touches `delegatorId` or
  the device storage, so the relay keep-alive re-registers the same guest.
- **`link` mode never switches the session**, so nothing needs installing and `onVerified` fires on
  the confirm alone.

## How to verify

```bash
npx jest --config libs/app-runtime/jest.config.js --runInBand --watchman=false --testPathPatterns "applySessionToken"
npx jest --config apps/web/jest.config.js --runInBand --watchman=false --testPathPatterns "features/auth"
npx jest --config apps/web/jest.config.js --runInBand --watchman=false --testPathPatterns "features/invite"
npx tsc -b apps/web/tsconfig.app.json
```

The `applySessionToken` suite pins the 403 contract end to end: a real `SocketManager` against a fake
relay server refuses `invite.create` while the identity is a guest, and the same
`getScopedClient('relay')` call succeeds afterwards. The `features/auth` suites cover the timer, the
error-code branches, the resend cap, the banner and the dev switches; the `features/invite` suites
cover the gate branches and the 403 fallback.

Type checking must be `tsc -b`. A `--noEmit -p` run reads the libraries' last-emitted `.d.ts` files,
so a stale `dist` invents errors the source does not contain.

The shells import concrete modules rather than barrels in two places — `KeyboardSafeAreaSpacer` and
`useLinkedAccounts` — because the barrels pull the whole runtime surface, which will not load under
the jsdom test setup. Keep it that way when adding an import to either file.

## Further reading

- [account-linking.md](./account-linking.md) — the packet, its modes and its steps.
- [international-phone-input.md](./international-phone-input.md) — country selection, validation and
  how a typed number becomes E.164.
- [README.md](./README.md) — the auth feature overview, and where login returns to.
- [invite](../invite/README.md) — the issue and accept flows that open these shells.
- [`libs/app-runtime`](../../../../../libs/app-runtime/docs/auth/README.md) — the controller that
  owns the socket handshake `applySessionToken` drives.
