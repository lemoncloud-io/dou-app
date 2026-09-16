# auth

**What `apps/web/src/app/features/auth` owns is proof of identity, not screens.** Three of its four
pages are plumbing — a compatibility shim, a logout runner, an OAuth callback — and the substance is
the phone-verification machine, the two shells that present it, and the hook every screen must use
to send a user to login.

Session state, tokens, signing and refresh are not here. They belong to
[`libs/app-runtime`](../../../../../libs/app-runtime/docs/session/README.md), and this feature reaches
them through the `runtime.session.*` facade.

## Purpose

Two questions land in this feature: _who is this session_, and _how does a user prove they are
someone else_. Everything under `features/auth` answers one of them.

Creating an account by email and resetting a password are next door in
[account](../account/README.md). Issuing and accepting a relay invite are in
[invite](../invite/README.md) — this feature only supplies the verification screen those flows open.

The invariant worth checking: nothing here builds a session by hand.

```bash
grep -rn "from '@chatic/app-runtime'" apps/web/src/app/features/auth --include='*.ts' --include='*.tsx'
```

Every hit should be a `runtime.session.*` or `runtime.data.*` call.

## Design principles

1. **A shell holds chrome, a hook holds behaviour.** `PhoneVerifyScreen` and `PhoneVerifySheet`
   differ only in framing; both drive `usePhoneVerify`. Adding a third presentation must change no
   behaviour.
2. **The request declares the intent.** `mode` (`'login'` | `'link'`) is derived from the session
   role by the caller and passed in. Nothing reads a response to work out what just happened.
3. **A session switch completes before the caller is told.** `applySessionToken` installs a new
   identity into the session store _and_ the live relay socket before `onVerified` fires, so the next
   call does not 403 on a stale identity.
4. **Errors branch on status codes.** `getSocketErrorCode` is the only input; a server message is not
   a contract. Log the raw failure anyway — most of these codes cover more than one condition.
5. **Credentials live in the request body.** Numbers, codes, OTPs and invite codes never reach a log
   line, a URL, a cache key or a query key.
6. **Login is an interruption, not a destination.** A user sent to login is in the middle of
   something; finishing returns them to it. One hook enforces that, and a test over the source tree
   enforces the hook.

## Scope

**In** — the OAuth callback, the logout runner, the `/auth/login` shim, the phone verification
machine and its shells, the account-split banner, and the login entry hook.

**Out**

- Session state, token refresh, signing, socket authentication —
  [`libs/app-runtime`](../../../../../libs/app-runtime/docs/session/README.md).
- Email sign-up and password reset — [account](../account/README.md).
- The relay invite flows, deeplink parsing and cloud entry — [invite](../invite/README.md).
- The login **screen** — it lives in [mypage](../mypage/README.md); this feature owns how users get
  there and where they return to.

## Structure

The arrow that does not exist runs from a shell to the runtime. `PhoneVerifyScreen`,
`PhoneVerifySheet`, `PhoneVerifyFields` and `PhoneVerifyBanner` render; they never call a mutation or
touch a session. Every judgement is in a hook, and every session read or write goes through
`runtime.session.*`.

Two things in the folder are worth knowing before you grep for a caller:

- `useClearCache` clears all seven repository caches, is exported from the barrel, and **nothing
  calls it today** — including logout.
- `utils/phone.ts` (`isValidKoreanPhone`, `formatPhoneNumber`) is tested and called by nobody; the
  live validation is [international-phone-input.md](./international-phone-input.md)'s.

`PhoneVerifyFields` is deliberately absent from `components/index.ts`, and two files here import
concrete modules rather than barrels, for the same reason: a barrel pulls the whole runtime surface,
which will not load under the jsdom test setup.

## Usage

Send a user to login with `useNavigateToLogin()` — never `navigate(ROUTES.mypage.login)`. A test
walks the source tree and fails on any file outside the hook and the route table that names that
route in either spelling.

Open verification by rendering a shell with the `mode` the caller derived (`'login'` for a guest,
`'link'` for a main user without a number). The full-screen shell additionally takes `context`
(`'invite-accept'` | `'invite-create'`), which picks its hero copy →
[phone-verification.md](./phone-verification.md).

The feature's three routes are plumbing: `/auth/login` forwards to the root route, `/auth/logout`
runs the logout, `/auth/oauth-response` runs the callback, and anything else falls back to the first.

## Scenarios

### 1. An OAuth redirect comes back

`useOAuthLogin` runs once on mount, reading `code`, `provider` and `state` from the query string. A
code shorter than six characters is treated as a failed callback: it logs, toasts and returns to the
login route.

Otherwise `runtime.session.createCredentialsByProvider(provider, code)` exchanges the code, and the
exchange **commits the session itself** — there is no follow-up refresh to recover identity fields.
The destination is `state.from`, falling back to `/home` when the state parameter will not parse.

`provider=invite` is the one branch that does not exchange: it requires a `delegatorId` on the
session and throws without one. The whole run is wrapped so that throw is logged as an AUTH failure
rather than escaping as an unhandled rejection.

### 2. `/auth/login` is opened

It is a shim, not a screen. Already-distributed deeplinks — the landing page and the native converter
both still build this address — arrive with `provider=invite&code=…&_backend=…`, and the page
forwards to the root route carrying the query string untouched.

Forwarding straight to the accept page would skip the entry gate at the root, which is the one place
that knows onboarding comes before an invite on a first run.

### 3. A user logs out

`LogoutPage` fires once, guarded by a ref, and calls `runtime.session.useSessionLogout()` — a
best-effort socket `auth.logout` followed by local teardown. A rejected teardown is logged, because
the screen otherwise renders a spinner forever with nothing written down.

The page does **not** clear repository caches. `useClearCache` exists and does that for all seven
repositories, but nothing calls it today.

Once the relay session ends, the runtime signs a guest back in on its own, so the next session starts
authenticated as the same device user.

### 4. A user is sent to login, and comes back

This is the reason `useNavigateToLogin` exists. It captures the current pathname, search and hash,
pushes the login route with them as router state, and the login screen returns with `navigate(-1)`.
Four rules make that more than a convenience.

**The hook captures the origin, not the call site.** The fallback is home, so a call site that forgot
to pass one would still "work" — and the mistake would surface only as someone's subscription flow
being cut short. `search` and `hash` ride along, because a screen that keeps state in the query string
only half-returns without them. The hook also refuses to point back at the login route itself.

**It is router state, never a query parameter.** `?returnTo=` would put an arbitrary path in the login
URL and hand it to a navigation. Router state lives on the history entry and cannot be injected from
outside.

**Returning is a back navigation, not a replace.** The entry point _pushed_ the login screen, so the
stack reads `[…, returnTo, /mypage/login]`. A `replace` would leave `[…, returnTo, returnTo]`, where
the first back press stays on the same screen and the user reads it as broken. Going back drops the
login entry and keeps everything before it. It also means `returnTo` is read purely as a **flag** —
"did we arrive from inside the app" — and no string ever reaches the router, so there is no redirect
surface to reason about.

The fallback is home with `replace`, used when there is no `returnTo` (a deeplink, a refresh) or no
history to go back to (a fresh WebView with router state but no stack). It passes `transition` and
`direction: 'back'` explicitly, because the transition helper disables animation by default when
`replace` is set.

Three entry points use the hook today — the MY page header, `PhoneVerifyBanner`, and the subscription
plans screen. The subscription **status** screen deliberately is not one: it routes to the plans
screen, which is where a guest is asked. The list is not fixed by a test; the invariant is.

### 5. A login fails or is cancelled

Nothing navigates. The user stays on the login screen with a toast, and pressing back returns them
where they came from, because the history was never rewound.

### 6. A guest proves a number

Covered in full by [phone-verification.md](./phone-verification.md): the send, the pinned country,
the confirm, and the two guards around installing the returned `$token`.

## Documents

| File                                                           | What it covers                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [account-linking.md](./account-linking.md)                     | The `auth.link-account` contract — type, mode, step, the relay pin, reading `link$` |
| [phone-verification.md](./phone-verification.md)               | The verification machine, both shells, error copy, and the session switch           |
| [international-phone-input.md](./international-phone-input.md) | Country selection, mobile-only validation, E.164 on the wire, keeping metadata lazy |

## How to verify

```bash
npx jest --config apps/web/jest.config.js --runInBand --watchman=false --testPathPatterns "features/auth"
npx tsc -b apps/web/tsconfig.app.json
```

- `loginEntryPoints.test.ts` is the one to read before adding a screen that links to login: it scans
  the source tree, so a new entry point is covered the day it is written.
- Type checking must be `tsc -b`. A `--noEmit -p` run reads the libraries' last-emitted `.d.ts`
  files, so a stale `dist` produces errors that are not in the source.
- The i18n resources load remotely. A wrong translation key renders as the raw key rather than
  failing a build, and the screen tests stub `t` to echo its key — so changing a key breaks
  assertions while changing its value does not.
- Downstream of this feature: [invite](../invite/README.md) and [mypage](../mypage/README.md) both
  import its components. Run their suites when a shell's props change.
