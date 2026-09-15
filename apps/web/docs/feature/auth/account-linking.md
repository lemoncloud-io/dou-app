# account-linking — one packet proves every credential

`auth.link-account` is the single place a user proves they own something: a phone number, a social
account, in principle an email address. One packet covers all of it, and three fields decide which
request it is — `type` (what is being proved), `mode` (what happens when the proof lands) and `step`
(where in the exchange this call sits).

This document owns that contract and the wiring underneath it. The screens that drive it live
elsewhere: [phone-verification.md](./phone-verification.md) for the number sheet and screen,
[account](../account/README.md) for the `/mypage/account` linking card.

## Layout

The path is four layers deep and each one adds exactly one thing: a screen drives `useLinkAccount`
(`apps/web/src/app/hooks/`), which calls `AuthRepository`, which delegates to `AuthSocketDataSource`
— the layer that assembles `type`, `mode` and `step` — which sends through a gateway bundle that
`socketFactory` pinned to the relay socket.

The bundle is pinned to the **relay** socket at composition time, not chosen per call, so no caller
can forget a route argument. It has to be relay: the main user this packet resolves lives on the
central backend behind the relay, whichever cloud happens to be connected.

`AuthSocketDomainGateway` is `Pick<AuthGateway, 'linkAccount'>` — one member. **`auth.update` is
deliberately not in it.** That packet is the socket handshake and belongs to the SDK's
`AuthController` alone; a second sender would authenticate a session the controller cannot account
for, because every input to its state machine is keyed to packets it sent itself. `libs/app-runtime`
enforces the absence with a test that walks its own source and fails on the string —
see [`libs/app-runtime`](../../../../../libs/app-runtime/docs/auth/README.md).

## Responsibilities

This layer decides **which packet to build**. It does not decide whether the proof succeeds, and it
does not decide what the session becomes — the request says that, and the server answers.

`AuthSocketDataSource` holds a monopoly on the packet vocabulary. Nothing above it writes the string
`'link'`, `'confirm'` or `'social'`. The layer builds only combinations the type union permits and
lets TypeScript reject the rest, because the server does not police which combinations exist.

`AuthRepository` is remote-only. There is no entity here to cache: a proof is an event, not a row.

## The shared contract

### The request declares the intent

```ts
export type AccountLinkMode = 'link' | 'login';
```

| `mode`    | Who calls it         | What the session does           | What comes back                   |
| --------- | -------------------- | ------------------------------- | --------------------------------- |
| `'login'` | a device (guest)     | changes — becomes the main user | `{ loggedIn, isNew, $token }`     |
| `'link'`  | an already-main user | unchanged                       | `{ linked, hint }` — **no token** |

The caller derives the mode from the session role (`isGuest`) and passes it as a required argument.
It has no default, on purpose: picking the wrong one is an error rather than a fallback — a main user
sending `login` gets 400, a device session sending `link` gets 403 — and a required argument is what
keeps both out of reach.

Never read the response to work out which happened. The request already said.

### Four steps, and when to skip one

- **`send` / `resend`** — the data source derives the step from a `resend` flag, so a caller never
  spells either out. Social has no send step at all: Apple and Google already did the proving.
- **`verify`** changes nothing on the server and is safe to repeat. On `mode: 'link'` it is the only
  place that will _tell_ you a commit is blocked, answering `{ linkable: false, reason }` where the
  reason is `'occupied'` (the credential is someone else's) or `'type-linked'` (this user already has
  one of that kind). On `mode: 'login'` it only reports that the code is valid, which `confirm`
  reports anyway.
- **`confirm`** commits. It meets the two blocked situations with a 409 and a 403 and no explanation.

So a **linking** screen always verifies first and a **login** screen never does. That asymmetry is
the single most important thing on this page.

There is no "extend the timer" step. An extend action resends, which issues a fresh code and a fresh
`expiredAt` but does **not** reset the wrong-answer counter.

### Options that must not be sent as `false`

`PhoneCodeSendOptions` carries delivery switches — `sms`, `slack`, `dryRun` — whose server defaults
are all "on" except `dryRun`. An unset switch is **omitted from the packet entirely**. Writing a
literal `false` turns a channel off rather than leaving it alone, which is how a dev build stops
receiving codes over Slack.

`countryCode` is an ISO alpha-2 default for a local (`0…`) number; the server defaults to `KR`, and
the value used to prove must match the value used to send.

The **invite code rides on `send` only**. The prove steps' union has no slot for it — number and
invite are matched once, at delivery, and on `mode: 'login'` a number that does not match the invite
gets no SMS at all (400 at send time). The type enforces this; there is nowhere to put the code
later even by mistake.

### Errors are read as status codes

Every branch goes through `getSocketErrorCode` (`apps/web/src/app/utils/errors.ts`). Nothing parses
a message string.

| Situation                                                    | Code |
| ------------------------------------------------------------ | ---- |
| Rate limits — cooldown, per-number, per-device, wrong-answer | 429  |
| Wrong code                                                   | 403  |
| `confirm` on a credential that is someone else's             | 409  |
| `confirm` on a kind this user already has                    | 403  |
| Mode/role mismatch (main user + `login`)                     | 400  |

Phone numbers, email addresses, OTPs and invite codes stay in the request body. They never reach a
log line, a cache key or a query key.

### Reading what is already linked

`UserView.link$` is the server's answer to "what has this user proved". `useLinkedAccounts` turns it
into three states per credential — `'linked'`, `'absent'`, `'unknown'` — plus display-only `phoneHint`
and `socialProvider`.

`'unknown'` means the `link$` object is missing entirely, which happens when the profile has not
landed or when the server never built the slot. **Never gate on it.** Treating it as `'absent'` asks
a social-registered user to link social (403 `type-linked`) and asks a phone user to verify a number
they already own. Fall back to the previous criterion — usually `isGuest` — instead.

`link$` is a hint for choosing a screen. The thing that actually blocks a bad link is `verify`'s
answer or `confirm`'s status code.

**Where it comes from is not the data layer.** `useMyUser` reads the account fields off the stored
relay token and refreshes them once from `user.profile`, writing the response back into the token.
It is not read out of the local cache, and it cannot be: the cache is keyed by `cid` and `uid`, so
while a cloud is active the relay user's row is unreachable. `link$` does not appear on the boundary
type either — `MyUser` widens `DomainUser` with `photo`, `email`, `link$` and `userRole`, because
every hop is a spread rather than a field allowlist. The cost of that is real: a server-side shape
change will not fail the build.

## Usage

### Proving a number

`useLinkAccount` exposes `send`, `verify` and `confirm`, each taking `mode` explicitly. A login proof
is `send` then `confirm`; a link proof is `send`, `verify`, and `confirm` only when the verify
answered `linkable`.

On `mode: 'login'` the `$token` must be installed before anything else is issued or accepted, or
those calls answer 403. `applySessionToken` owns that installation —
[phone-verification.md](./phone-verification.md) covers the ordering.

### Adding a credential kind

1. Extend the union in `AuthSocketDataSource` so the new `type`/`step` combination exists. If the
   combination is not expressible, it is not supported.
2. Add the method to `IAuthSocketDataSource` and delegate it from `AuthRepository`. Remote only.
3. Expose it as a mutation on `useLinkAccount`, taking `mode` as a required argument.
4. Verify before confirming, unless the kind has no `linkable` answer.

### What not to do

- **Do not spell a packet field above the data source.** A `mode: 'link'` string in a component means
  the vocabulary has leaked out of the one layer that owns it.
- **Do not add a second `auth.update` sender.** The absence is enforced by a test, and the reason is
  in [`libs/app-runtime`](../../../../../libs/app-runtime/docs/auth/README.md).
- **Do not pass delivery switches as `false` to mean "default".** Omit them.
- **Do not branch on the response shape to learn the mode.** The request knew.
- **Do not treat `'unknown'` as `'absent'`.**

## Notes for implementers and tests

- **Email is typed but has no screen.** The server answers 501 on an email send. The slot exists in
  the vocabulary and nothing drives it.
- **Unlinking does not exist.** There is no detach packet, and `SOCIAL_UNLINK_ENABLED` stays `false`
  in `apps/web/src/app/features/mypage/flags.ts` until one arrives.
- **Several credentials of one kind is not a client limitation.** `link$.social` is a single slot and
  the server enforces it with `type-linked`. Changing a number, a second account of the same kind and
  a `login` mode for social or email are all undefined server-side.
- **The first paint has no `link$`.** Until `user.profile` answers, the token seed is all there is,
  so the `'unknown'` rule covers that window too.
- **An omitted field does not clear a stored one.** The token patch drops `undefined` values; only an
  explicit `null` clears. That is deliberate — a slim response must not erase the auth carrier — but
  it means a stale `link$` can outlive the response that dropped it, which has to be re-judged the day
  an unlink endpoint exists.
- **A backfill for older accounts may not have run.** Those users read `'unknown'` and the linking
  card stays hidden. Nothing wrong is displayed, but nothing useful is either.

## How to verify

```bash
npx jest --config libs/data/jest.config.js --runInBand --watchman=false --testPathPatterns "Auth"
npx jest --config libs/app-runtime/jest.config.js --runInBand --watchman=false --testPathPatterns "socketFactory"
npx jest --config apps/web/jest.config.js --runInBand --watchman=false --testPathPatterns "PhoneVerify|useSocialLinks|ContactInvitePage"
npx tsc -b apps/web/tsconfig.app.json
```

The `libs/data` run covers the assembly — the mode axis, the step derivation from `resend`, the
omission of unset switches, the absence of `code` on the prove steps — and fixes the contract that
`linkable: false` is a **response**, not a thrown error. The `socketFactory` run covers the relay pin,
observed through the data source because the gateway bundle is not handed out.

Type checking must be `tsc -b`. A `--noEmit -p` run reads the libraries' last-emitted `.d.ts` files,
so a stale `dist` invents errors that the source does not contain.

## Further reading

- [phone-verification.md](./phone-verification.md) — the two shells that drive this packet, and the
  `$token` installation on the login path.
- [international-phone-input.md](./international-phone-input.md) — how a number reaches E.164 before
  it is sent.
- [account](../account/README.md) — the `/mypage/account` card that reads `link$` and links social.
- [`libs/app-runtime`](../../../../../libs/app-runtime/docs/auth/README.md) — who owns the socket
  handshake, and why nothing here may send it.
