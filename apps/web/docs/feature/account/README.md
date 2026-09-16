# account — email sign-up and password reset

**Two multi-step email flows, and nothing else.** `apps/web/src/app/features/account` holds six
screens that walk a user from an email address to a verification code to a password: sign-up, and
password reset. Both legs run on one mutation from `@chatic/app-runtime`, and the feature itself
owns no session state.

Logging in, delegating a session and accepting an invite belong to [auth](../auth/README.md). The
"account" in `/mypage/account` is a different screen in a different feature — see
[social-links.md](./social-links.md), which lives here and says why.

## Purpose

This feature converts an email address into a credential the relay backend will accept. It decides
the screen order, the field validation and where each step navigates. It decides nothing about
tokens, sessions or who the user is.

The invariant: no file under `features/account` touches a store, a socket or a repository. The
check is that its only non-UI import is the runtime facade.

```bash
grep -rhn "from '" apps/web/src/app/features/account --include='*.tsx' --include='*.ts' \
  | sed "s/.*from '//;s/'.*//" | sort -u
```

## Design principles

1. **The step vocabulary is the server's, not ours.** `mode` (`'signup'` | `'find'`) and `step`
   (`'send'` | `'resend'` | `'check'` | `'change'` | `'confirm'`) come from `VerifyAliasBody` in
   `libs/http/src/gateways/oauth.ts`. A screen picks a pair; it does not invent a step name or map
   one onto another.
2. **Pages hold the flow, components hold the form.** Each page is a thin wrapper that supplies
   `translationPrefix` and an `onSubmit`; the component underneath knows nothing about sign-up or
   reset. That is why one `VerifyCodePage` serves both journeys.
3. **Progress lives in `location.state`, never in a URL.** The address, the `userId` and the code
   travel as router state. They are not query parameters, so they are not shareable, not in history
   and not in a log line.
4. **Every step that can fail raises a toast and stays put.** The submit handlers return `false`
   rather than throwing, so the form re-enables and the user can retry on the same screen.
5. **A step reached without its state redirects to the start.** Each screen after the first runs an
   effect that sends the user back to the flow root when `email` is empty. Deep-linking into step
   three is not a supported entry.

## Scope

**In** — the six screens, their shared form components, the password-length rule, and the mapping
from screen to `mode`/`step`.

**Out**

- The mutations themselves (`useVerifyAlias`, `useFindAlias`, `useSessionIdentity`) —
  [`libs/app-runtime`](../../../../../libs/app-runtime/docs/session/README.md).
- The wire contract (`POST /oauth/verify-alias`, `POST /oauth/find-alias`) — `libs/http`.
- Login, logout and the OAuth callback — [auth](../auth/README.md).
- Linking a phone number or a social account to an existing user — [auth](../auth/README.md) owns
  the contract, [social-links.md](./social-links.md) the screen.

## Structure

A form component never calls a mutation — it takes a callback. That is what lets sign-up and reset
share all three of them (`EmailInputPage`, `VerifyCodePage`, `SetPasswordPage`), with the page
supplying `translationPrefix` and an `onSubmit`.

Both journeys are the same three steps. Sign-up sends, checks and confirms; reset sends, checks and
changes — and differs in two places: `ResetPasswordEmailPage` asks `useFindAlias` whether the address
has a user **before** sending a code, and its last step carries the code forward from step two.

There is no `hooks/`, no `types/` and no `utils/` to open, and `constants/` holds one value
(`MIN_PASSWORD_LENGTH`). The mutations are the runtime's, the bodies are typed in `libs/http`, and
the shared helpers moved out when a second feature needed them — the code length and timer, the
email check and the countdown formatter live in `app/utils/verification.ts`, and
`VerificationCodeInput`, `KeyboardAwareLayout` and `useFormKeyboardFlow` in `app/ui`. The
subscription feature's `EmailVerifyDialog` is that second consumer.

## Screens

| Page                      | `ROUTES.account.*`                     | What it does                                 |
| ------------------------- | -------------------------------------- | -------------------------------------------- |
| `SignupEmailPage`         | `/account/signup`                      | Email in, `step: 'send'` out                 |
| `SignupVerifyPage`        | `/account/signup/verify`               | 6 digits, 3-minute countdown, resend         |
| `SignupPasswordPage`      | `/account/signup/password`             | Password + confirmation, `step: 'confirm'`   |
| `ResetPasswordEmailPage`  | `/account/reset-password`              | `useFindAlias` first, then `step: 'send'`    |
| `ResetPasswordVerifyPage` | `/account/reset-password/verify`       | Same code screen, `mode: 'find'`             |
| `ResetPasswordNewPage`    | `/account/reset-password/new-password` | New password, `step: 'change'` with the code |

Both journeys end on `ROUTES.auth.login` after a success toast.

## Usage

A page supplies the flow, the component supplies the form: the page calls
`runtime.session.useVerifyAlias()` with the `mode`/`step` pair its screen owns, navigates on with
`replace` and the state the next screen needs, and returns `false` on failure so the form re-enables.

`userId` on the sign-up leg comes from the guest session that already exists when the screen opens —
the app boots into a device session before anyone reaches `/account/signup`. Reset does not send one,
because the address is the identifier there.

## Scenarios

### 1. A code arrives late and the user asks for another

`VerifyCodePage` holds its own countdown, seeded from `VERIFICATION_TIMER_SECONDS`. The resend
button calls `onResend`, which fires `step: 'resend'`; on return the component resets the timer,
clears the entered digits and restarts. The timer reaching zero disables nothing — the server
decides whether an old code still works.

### 2. The sixth digit is typed

An effect watches for `code.length === VERIFICATION_CODE_LENGTH` and submits without waiting for
the button, guarded on `loadingState === 'idle'` so a slow request cannot start a second one. The
footer button stays as the manual path for a user who edits a digit back in.

### 3. A reset is requested for an address with no account

`useFindAlias` answers `{ hasUser: false }` and the page stops there with a toast — no code is sent.
This is the one place a screen asks a question before acting, and it exists so an unregistered
address does not sit waiting for mail that will never come.

### 4. The user hits back from step three

`location.state` is not restored by a fresh navigation, so `email` is empty, and the effect at the
top of the screen replaces the route with the flow root. The flow restarts rather than resuming with
a half-filled body.

### 5. A step fails

Every `mutateAsync` is wrapped. The catch raises a `destructive` toast keyed on the
`translationPrefix` (`signup.*` / `resetPassword.*`) and returns `false`, so the form re-enables in
place. No screen retries on the user's behalf.

## Documents

| File                                 | What it covers                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| [social-links.md](./social-links.md) | The `/mypage/account` linking card — phone and social credentials on one user |

`social-links.md` documents code in `features/mypage`, not in `features/account`. It sits in this
group because the subject is the user's account credentials; the screen it describes is reached from
[mypage](../mypage/README.md).

## How to verify

```bash
npx tsc -b apps/web/tsconfig.app.json
npx jest --config apps/web/jest.config.js --runInBand --watchman=false --testPathPatterns "verification"
```

- Type checking must be `tsc -b`. A `--noEmit -p` run reads whatever `.d.ts` files the libraries
  last emitted, so a stale `dist` produces errors that do not exist in the source.
- This feature ships no test of its own. The behaviour that is covered lives one level out, in
  `apps/web/src/app/utils/verification.test.ts` and
  `apps/web/src/app/ui/components/VerificationCodeInput.test.tsx`. The six pages are verified in a
  preview, per the convention in [mypage](../mypage/README.md).
- The i18n resources load remotely; there is no `translation.json` in the repo to grep for a missing
  key. A wrong `translationPrefix` shows up as a raw key on screen, not as a build failure.
