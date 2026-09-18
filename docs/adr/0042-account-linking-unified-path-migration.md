# ADR-0042: Migrate wholesale to the unified account linking path (`auth.link-account`)

> Status: Accepted · Decided: 2026-08-03
> Follows: [ADR-0089](./0089-relay-dm-invite-and-auth-parallel-tracks.md) · [ADR-0034](./0034-inviter-phone-verification-guest-gate-and-sheet.md) · [ADR-0036](./0036-data-surface-unification-app-runtime-cleanup.md)

> **Naming note (2026-09-01):** the `*RemoteDataSource` · `RemoteGatewayBundle` · `*DomainGateway` ·
> `remoteFactory` · `remote/data-sources/` names this document uses are **the names of the time**. The
> mapping after the socket axis moved to the `Socket` prefix is in
> [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#naming-history). This is a record,
> so the body is left as it is.

## Context

The server has gathered the account verification paths into one. The source is `chatic-sockets-api`
`docs/specs/relay-server-invite/` (Rev 2026-07-31, with 05-client-guide.md as the canon for the app), and the
policy source is `docs/specs/relay-server-user-invite/account-linking-design.md` on the
`feat/relay-server-user-invite-v2` branch of `chatic-backend-api`.

Three things changed.

1. **Means, mode and step unified into one.** Phone, email and social are all received by the single
   `auth.link-account` packet. It is a discriminated union of `type` (what you prove with) · `mode` (what happens
   after the proof: `link` = attach the means to the current session / `login` = open a session as the owner of
   that account) · `step` (`send`, `resend`, `verify`, `confirm`).
2. **Proof and commit are split.** `verify` only answers whether the code is correct and changes nothing. Only
   the `verify` of `mode: 'link'` returns `{ linkable, reason }` (`reason`: `'occupied'` = that account belongs to
   someone else / `'type-linked'` = that means is already attached with a different value), and **`confirm`
   answers the same situations with 409/403 errors.**
3. **`UserView.link$` appeared.** It is the place where the server tells us which means a user has attached
   (`{ phone?, email?, social? }`, each entry being `{ hint, provider, linkedAt }`).

The two old paths (`auth.verify-hash-alias` · `auth.attach-social`) keep working but are marked `@deprecated`, and
the backend is waiting, _"we delete them as a set once the app moves"_. This work is the precondition for that
removal.

### The app's current state, as confirmed by investigation

- **There is no way to call `auth.link-account`.** The `AuthGateway` of `chatic-sockets-lib@0.4.9` has only
  `verifyHashAlias` and `attachSocial`; `linkAccount` first appears in **0.4.12**.
- **There is no `verify` step at all.** `AuthRemoteDataSource.ts:68-92` uses only the old path's `step: 'check'`,
  and `usePhoneVerify.ts:270` commits automatically as soon as the 6th digit is reached.
- **There is no concept of "does the user hold a phone number".** The signals we have are `isGuest`
  (`useRuntimeProfile.ts:60`), the per-invite `needVerify`, and a localStorage guess
  (`chatic-linked-social-providers`, `useSocialLinks.ts:17`). `useSocialLinks.ts:64-70` records that guess as
  "TODO(backend) request #6", and `link$` is that request.
- **The read path for `link$` is already open.** The app already calls `user.profile`
  (`useMyUser.ts:39` → `UserRepository.getMyProfile`), and the whole pipeline is spread-based
  (`UserRemoteDataSource.ts:71` → `mappers.ts:172` → `UserLocalDataSource.ts:96` → IndexedDB), so unknown fields
  are not dropped. **The only thing in the way is types** — the boundary type is `UserView` from
  `@lemoncloud/chatic-socials-api`, while the payload is backend-api's `MyUserView`.
- **Both invite entry points are guest-only, so they are always `login`.** The place that needs `mode: 'link'` (a
  social signup who is already a main user but has no phone number) does not exist yet.

### Two open items that need server confirmation

This ADR does not wait for the answers; it picks **the side where the screen does not break whichever way the
answer goes.**

- **Backfilling `link$` for existing users.** The design document presumes "a one-off patch that walks the
  accounts and fills users in before the new path opens", but that task is absent from the 7 implementation steps
  of `account-linking-plan.md`. Before the backfill, `link$.social` is empty for users who signed up with social,
  and `link$.phone` is empty for users who signed up with a phone number.
- **Whether `user.profile` carries `link$`.** By type it does, since `UserProfile$.$user: UserView`. But the
  design document states that "when producing a response, the stored object is not shipped as is; only the display
  slots are picked and rebuilt", so the code that builds the view lives separately per path, and whether the
  `/profile` path builds that slot is not in the document.

## Decision

### 1. Bump three libraries — a hard precondition

| Package                          | Current                     | Bump to     | Why                                                                                      |
| -------------------------------- | --------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `@lemoncloud/chatic-sockets-lib` | `0.4.9` (pinned)            | `0.4.12`    | `AuthGateway.linkAccount` · the `AuthLinkAccountInput` discriminated union               |
| `@lemoncloud/chatic-backend-api` | `^0.26.704` (705 installed) | `^0.26.706` | the `LinkAccountBody`/`LinkAccountView` unions · `LoggedInView.isNew` · `UserView.link$` |
| `@lemoncloud/chatic-sockets-api` | `0.26.704` (pinned)         | `0.26.709`  | `auth.link-account` plus the wiring for the 4 invite packets                             |

Without the versions, no item in this ADR can be started. Bump all three in one commit and confirm
`npx tsc --noEmit` is green first.

**Error code handling is unaffected by this bump.** The rejection path of 0.4.9 and 0.4.12
(`pending-request-store.js`) is byte-identical, and both discard the `errorCode` of the `:error` frame and keep
only the `message.error` string. `getSocketErrorCode` (`utils/errors.ts:20`) is already defended to read
`errorCode` first and fall back to prefix parsing, so it survives unchanged.

### 2. Migrate the old paths wholesale — down to zero call sites

No call sites of `verifyHashAlias` or `attachSocial` are left. The migration points:

- Add `linkAccount` to the `Pick` of `AuthDomainGateway` (`libs/data/src/remote/gateways/index.ts:21`), and
  **pin it to the relay-scoped client** in `remoteFactory.ts:58-62` (same as the old two).
- `AuthRemoteDataSource` owns assembling `type`, `mode` and `step`. The `step` derivation lives in this layer today
  (`:68-92`), so it does not move.
- Replace the app hooks `useVerifyHashAlias` and `useAttachSocial` with `linkAccount`-based ones.

Once the migration is done, the old-path deletion the backend is waiting on is unblocked.

### 3. The session role picks the mode — no branching on the opened response

`isGuest` means `mode: 'login'`, a main user means `mode: 'link'`. A mismatch is an error (a main user calling
`login` gets **400**, a guest calling `link` gets **403**) — picking by role in advance means we never meet either.
ADR-0034 already laid down the `isGuest` gate, so no new place is created.

### 4. `verify`/`confirm` are split only in `link`

| Mode                                     | Flow                                                          | Why                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `link` (phone and social linking)        | `verify` → show `linkable` on screen → `confirm` from the CTA | When `linkable: false`, the commit button is disabled and the `reason` is explained. `confirm` answers the same situations only with 409/403 errors, so asking first is better |
| `login` (phone login in the invite flow) | a single automatic `confirm` (current behaviour kept)         | The `verify` of `login` only answers `{ verified: true }`, so there is nothing to gain. The UX of the two existing invite flows is untouched                                   |

The automatic submit of `usePhoneVerify.ts:270` and the `pendingToken` retry structure survive as they are on the
`login` path.

### 5. Treat `link$` as "use it if it is there, otherwise we do not know"

**The truth about blocking is not `link$`.** The contract is the server errors (403 `type-linked` / 409 `occupied`)
and the `linkable` that the `verify` of `mode: 'link'` returns; `link$` is **a hint for picking the screen in
advance**.

- If `link$.phone` is present → show "verified `****{hint}`" and do not ask for verification.
- If `link$.phone` is **absent, or `link$` itself is absent** → make no judgement and fall back to the criterion
  used so far (`isGuest`). We do not distinguish between "empty because the backfill has not run" and "genuinely
  has no phone number".

Done this way, a later backfill does not require redrawing the screen; only the precision goes up.

The read sites are `useMyUser` and `useRuntimeProfile`, and **the type is widened on the reading side** — exactly
the technique already used by `MyUser = DomainUser & { photo?, email? }` (`useMyUser.ts:14`) and `SessionUserView`
(`useRuntimeProfile.ts:12`). The boundary type (socials-api `UserView`) is not switched to backend-api. That is
beyond the scope of this work.

### 6. Narrow the eligibility to issue an invite to "holds a phone number" — a client gate

This is the point guide §A-1 left open with _"this may later be narrowed to require phone verification"_. The gate
of `ContactInvitePage` widens from `isGuest` to:

- Guest → phone **login** (`mode: 'login'`) — the current `PhoneVerifySheet`, unchanged.
- A main user whose `link$.phone` is **read as explicitly absent** → phone **linking** (`mode: 'link'`).
- Otherwise (main user with a phone number, or `link$` could not be read) → the issue form.

**The server does not enforce this policy** — it still allows a user with social only to issue invites. It is the
same setup ADR-0034 established: **the client gate is UX and the server 403 is the contract.** The 403 fallback at
`ContactInvitePage.tsx:126` stays as the safety net.

The `confirm` of `mode: 'link'` **does not return a token** (the session is unchanged). `applySessionToken.ts:48`
already handles an empty `$token` as a linking-only no-op, so the session layer is not touched.

### 7. Open both phone and social in the my-page account linking section

- Drop the `SOCIAL_LINK_ENABLED` (`features/mypage/flags.ts:29`) precondition.
- **Retire the localStorage guess (`chatic-linked-social-providers`)** and switch the display to `link$`. If
  `link$` cannot be read, do not assert a state — collapse the section. That is better than showing a wrong state.
- Add a place for phone linking (`mode: 'link'`, the two-step flow of §4).
- Move the `attachSocial` call to `linkAccount({ type: 'social', mode: 'link' })`. The native-bridge-only
  restriction (the `isNative()` guard at `useSocialLinks.ts:94`) stays.

### 8. On invite accept, compare the phone number by `last4` **before** sending

The most the app can know about "is the number typed in the number that was invited" is **the last 4 digits**. The
server does not store the raw number (only a hash) and does not ship it in the response either, so a more precise
comparison is fundamentally impossible.

Today not even those 4 digits are used — `usePhoneVerify` takes only `inviteCode` (`:38`, `:102`), and when the
number does not match, the message appears **only after one server round trip** (the 400 branch at `:163`).

Pass `last4` down to `PhoneVerifyScreen` and compare it at the send button first. On a mismatch, do not call the
server and show `phoneVerify.inviteMismatch` right there.

- The value is already in hand. `flow.invite` is exposed as state (`useRelayInviteFlow.ts:91,239`) and its type is
  `RelayInviteView & …` (`:25`), so `last4` is attached. It reads directly where `RelayInviteAccept.tsx:59` mounts
  `PhoneVerifyScreen`.
- **Keep the server 400 branch as it is.** A 4-digit match is not a definitive verdict (with a different country
  code the tail can match a different number), and the full comparison is done by the server against the hash.
  Same setup as §6 — the client comparison is UX, the server is the contract.
- **Skip the comparison when `last4` does not arrive.** There is no documented guarantee that `invite.get` (the
  accept side) ships `last4` — the place the app reads `last4` today (`InviteChannelRow.tsx:38`) is the issuer's
  `invite.list`. Fall back by the same rule as §5.

What is gained is immediate feedback with zero round trips, and not burning the send limit (10/day per number ·
20/day per device) on a typo. Whether a wrong-number attempt turns that counter is not in the spec, so not burning
it is the safer side.

**No re-invite comparison is done in the issue flow.** `useSentInviteLog.ts:64` notes the same point in a comment,
but it is a separate matter.

### 9. Put phone login side by side on the my-page login screen

Right now the only way to become a main user with a phone number is **the invite flow** (§A-1, §A-2). Add phone
login to `LoginPage` to create a login path unrelated to invites (`mode: 'login'`, no invite code).

**Put them side by side on one screen.** The social buttons on top, and below them "or log in with your phone
number".

- **Put the account-divergence warning inline, right above the phone section.** `PhoneVerifyBanner` is not used —
  that is the component that **sends** you to `ROUTES.mypage.login`, and this is that destination
  (`PhoneVerifyBanner.tsx:26`). A banner that sends you to yourself must not be attached.
- **The nature of the defence changes.** Until now it was "send them from the phone screen to the social screen";
  now it is "show both options on the same screen, with social first". What the spec asks for is not blocking but
  informing (_"the server cannot block it in advance… this notice is the only defence"_), so this side reaches the
  user earlier. The `PhoneVerifyBanner` of the invite flow stays — there, there is only one option.
- **Pick the first screen after success with `isNew`** — true means signup, false means return.
- Share the post-success history cleanup (`window.history.go(-stepsBack)` at `LoginPage.tsx:43-51`) with the phone
  path.

**Phone login does not carry an `isNative()` guard — browser login is opened up.** It is a socket call, so native
is not needed. Today `LoginPage` shows social only on native and shows browsers just `mobileOnly` (`:107-111`), so
**login is outright impossible in the browser build.** Narrow that copy to social only and always show the phone
section.

**In the browser there is no escape hatch from the divergence warning.** Because social login is native-only (D),
"log in with social first" becomes advice that cannot be carried out in a browser. In the browser the copy changes
to the literal **"기존 계정이 있다면 앱에서 소셜로 로그인해 주세요"** ("if you have an existing account, please log
in with social in the app") and stops at informing — no navigation link is given.

#### 9-a. Reinforcement: phone login is not exposed in production (2026-08-03)

After implementing §9 above, **the fact that subscriptions hang off social linking** was confirmed — a subscription
attaches to a cloud, and cloud ownership is based on the social account. That is, a user who signed up with a phone
number alone has nowhere for a membership to attach even if they pay.

So the phone login entry point goes behind `isDevBuild()` (`VITE_ENV` DEV/LOCAL) and **production keeps social as
the only login.** The judgements of §9 (the place, the order, the warning copy) remain valid, and the wiring and
tests remain too — the only thing that changed is when it is exposed. Once that coupling and the divergence notice
are sorted out, it opens with a one-line switch.

The browser copy follows this switch too: when phone login is hidden, "please log in in the app" is true, and in a
build where it is visible **only social** is app-only, so the copy diverges.

#### 9-b. The subscription call rejects a missing social in front of the store

`validateMembership` runs **after the purchase**, so failing there means the money leaves and the subscription does
not attach. `useSubscriptionIap.purchaseAndValidate` rejects before opening the store.

**Block only when `link$.social` is `'absent'`.** Reading `'unknown'` (profile not yet arrived · an existing
account not yet backfilled) as "no social" would **block renewals for existing paying users** — the rule of §5
earns its keep especially here. Restores (`restorePurchases`) are not blocked: a payment that already exists
belongs to someone, and each one goes through server validation and is skipped on failure, so the worst case is
zero items.

### What is taken out of scope

- **The email means.** The server cuts sending off with a `501`. The type slot is let through but no screen is
  built.
- **Unlinking.** Undecided on the server. `SOCIAL_UNLINK_ENABLED = false` stays.
- **Changing the phone number · multiple accounts per means · the `login` mode for social and email.** All
  undecided on the server.
- **Unifying the boundary type onto backend-api.** Only `link$` is widened on the reading side.
- **Pulling `errorCode` out of the frame and attaching it to the Error.** That is homework on the lib side.
- **Moving `user.profile` to the REST `GET /users/0/profile`.** `fetchProfile`
  (`libs/web-core/src/api/auth.ts:128`) already exists as dead code, so it is kept only as a fallback card.

## Alternatives

**`linkAccount` only in the new places, the existing invite flows keeping the old path.** The smallest option, but
the two paths coexist and the migration is left as homework. The backend's old-path deletion stays blocked, and
even if the server guarantees "the verdict does not diverge", there are two pieces of code doing the same job in
the app. Dropped.

**Splitting `verify`/`confirm` in both modes.** Consistent, but the `verify` of `login` is only
`{ verified: true }`, so the user gains nothing, and invite accept costs one more round trip. Dropped.

**Deciding from the `linkable` of `verify` alone, without using `link$`.** The read dependency disappears, so the
open backfill question stops being a problem at all. But the user only learns "it is already attached" **after**
typing the number and receiving the OTP, and the my-page linking status display would have to keep using the
localStorage guess. Dropped.

**Waiting for the backend's answers (the backfill and the `user.profile` view) before starting.** Certain, but
written as in §5 the screen does not need redrawing whichever way the answer goes. There is no reason to wait.
Dropped.

**Falling back to the localStorage guess when `link$` cannot be read.** Mixing two truths makes it impossible to
trace which one was wrong. We chose the side that asserts nothing when it cannot read (§7).

## Consequences

What is gained:

- The place that proves an account means becomes one in the app too. Adding a means does not add a call site.
- The old-path deletion the backend is waiting on (`verify-hash-alias`, `attach-social`) is unblocked.
- The truth about linking status moves to the server — the localStorage guess and the `hasAnyLinked` proxy
  disappear, and the TODO(backend) request #6 at `useSocialLinks.ts:64-70` closes.
- The linking screen blocks ahead of time with `linkable` instead of "pressed the button and got an error".
- A phone number can be required even of users with social only, shrinking the surface for accident of a diverging
  account.

Trade-offs accepted:

- **The issue gate is client-only.** The server does not enforce it, so other clients bypass it. The 403 fallback
  is the only contract.
- **Before the backfill, the narrowing of §6 does not really work.** Existing users' `link$` is empty, so we fall
  back to the `isGuest` criterion and behave exactly as today. Safe, but part of the value of this work is tied to
  the backfill.
- **`cacheWrite` is a merge, so stale `link$` lingers** (`UserLocalDataSource.ts:96-102`). Once a value is written,
  it stays in the cache even if later responses omit that slot. It becomes a bug once unlinking exists, so replace
  semantics have to be judged together with opening unlinking.
- **`link$` is invisible in the types.** It depends on an intersection type on the reading side, so the compiler
  will not catch it if the server changes the shape.
- **`link$` may be absent on the first paint.** That is the stretch where only the token seed
  (`useSeedMyUserCache.ts:22-29`) exists. Since `LoggedInView.$token` is `UserTokenView extends UserView`, it is
  resolved if the server fills that slot, but there is no guarantee. §5's "fall back when it cannot be read" covers
  this stretch too.
- **Error branching keeps depending on parsing the message prefix.** The lib does not attach `errorCode` to the
  Error. The version bump does not fix this, so it breaks silently if the server copy changes.
- **Social linking is still native-only.** The browser build ends in a `mobileOnly` toast.
- **Browser login is opened for the first time** (§9). A combination that did not exist until now becomes a normal
  state — a session that logged in with a phone number only, cannot attach social (C-1 is native-only), and has no
  escape hatch from the divergence warning. How native-only features look in that session has to be checked.
- **The divergence defence splits into two shapes** — the invite flow has a navigating banner
  (`PhoneVerifyBanner`), the login screen has inline copy. The same risk is managed with two pieces of copy, so
  keep them tied together so they do not drift.

## Next steps

This ADR is handed on as the input to the spec writing (Phase A) of `dev-2_implement`. The order of work is
**§1 version bump → §2 gateway and data source migration → §4 introducing `verify` → §5 reading `link$` →
§6 the issue gate → §7 my page**. Nothing else compiles until §1 is green. §8 depends on no other item, so it can
be slotted in anywhere.

The exhaustive comparison table of scenarios, steps and responses is kept separately in
docs/plans/account-linking-scenarios.md, which lived in the root docs tree and has since been removed. It is the
input to the Phase A spec.

The three things to confirm with the server (the backfill · `link$` in `user.profile` · `last4` in `invite.get`) do
not block starting, but answers raise the precision of §5–§8, so ask them in parallel.

### Follow-up request — please add invite comparison to the `link` mode too (added 2026-08-05)

This is a hole that surfaced while fixing the `400 @mode[login] is for device session` found in production. The
invite accept screen now picks `login`/`link` by session kind (§3), but **the `link` path has no invite number
comparison on the server at all** — `src/lib/auth/link-account.ts:286` of `chatic-backend-api` has
`const code = mode === 'login' ? … : ''` and then wraps `assertInviteMatched` in `if (code)`, so it cannot be
entered at all under `link`.

The problem is **that it cannot be undone**. Once `commitLink` attaches the number to the account, `judgeLink`
permanently blocks reattachment with `type-linked` (same file `:136`, "swapping the means is out of scope"), and
there is no unlink endpoint anywhere in the backend (`grep -riE "unlink|detach" src` → 0 hits). That is, verifying
a number different from the invited one through this path pins that number to the account permanently, the invited
number can never be linked, and so that invite — and every later invite to that number — becomes unacceptable.

The only defence the client can mount is the `last4` comparison from `invite.get`, so that is enforced now — a hard
block before sending (`usePhoneVerify`), and if `last4` is missing, verification on the `link` path is not started
at all (`useRelayInviteFlow`). But the last 4 digits are country-agnostic and client-only, so they are not enough as
the defence for an irreversible write.

**Request:** read `code` in `link` mode too, and run `assertInviteMatched` before `commitLink`. The comparison must
come first and the linking second. At that point the client defences above stay as a second layer of safety.
