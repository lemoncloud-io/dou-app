# ADR-0044: Introduce a country to phone input and actually send `countryCode`

> Status: Accepted · Decided: 2026-08-04
> Follows: [ADR-0033](./0033-relay-dm-invite-and-auth-parallel-tracks.md) · [ADR-0034](./0034-inviter-phone-verification-guest-gate-and-sheet.md) · [ADR-0042](./0042-account-linking-unified-path-migration.md) · [ADR-0043](./0043-relay-invite-cancel-reject-adoption.md)
>
> **Scope deviation (2026-08-04, adjusted on this branch):** the original proposal (work done on a
> separate branch) limited scope to two screens — relay 1:1 invite creation and phone verification.
> A request to also include cloud invites (`user.invite` / `user.invite-batch`) was reviewed, but the
> backend request types still have no slot for `countryCode` (checked directly —
> `MyUserInviteBody` and `asInviteBody` in `chatic-backend-api`, and
> `UserInviteRequestData` / `UserInviteBatchRequestData` in `chatic-sockets-api`, all lack it), so it
> stays out of scope again. The "Out of scope" section below remains valid as written — the cloud
> extension is handled in a separate ADR once the backend follows.

> **Naming note (2026-09-01):** the `*RemoteDataSource` · `RemoteGatewayBundle` · `*DomainGateway` ·
> `remoteFactory` · `remote/data-sources/` names used in this document are **the names of the time**.
> The mapping after the socket axis moved to the `Socket` prefix is in
> [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#naming-history). This is a
> record, so the body stays as written.

## Context

Every phone number input in the app assumes a Korean number. Validation is fixed to the
`010/011/016/017/018/019` prefixes and a length of 10–11 digits, and the requests that leave for the
server carry no country information.

**The server is already ready.** Both `auth.link-account` and `invite.create` accept `countryCode?`.
It is ISO alpha-2, defaults to `KR` when unspecified, and **sending the same value on send and on
prove is what makes both look at the same account** (source: `chatic-sockets-api`
`docs/specs/relay-server-invite/05-client-guide.md` §contract, Rev 2026-07-31).

**The data layer is already open too.** `PhoneCodeSendOptions.countryCode` and
`PhoneCodeProveOptions.countryCode` are declared on `AuthRemoteDataSource` and carried all the way to
the packet (`libs/data/src/remote/data-sources/AuthRemoteDataSource.ts:41,53,145,160`),
`AuthRepository` passes them through, and `PhoneCodeProveArgs` in `useLinkAccount` has the slot.
`AuthRemoteDataSource.test.ts:152` even has a `countryCode: 'JP'` case.

**The one broken link is the UI layer.** `usePhoneVerify` puts the value into none of `send`,
`verify`, or `confirm` (`apps/web/src/app/features/auth/hooks/usePhoneVerify.ts:195,227,301,325`), so
real calls always end up on the server default `KR`. On the `invite.create` side, `useRelayInvites`
narrowed the input type to `{ phone, name }`, which blocks putting the value in at all
(`apps/web/src/app/hooks/useRelayInvites.ts:76,93`).

Separately, the auth-side copy of the utilities is missing `normalizeKoreanPhone`, so **pasting a
`+82…` form fails validation today** (`apps/web/src/app/features/auth/utils/phone.ts`).

### Constraints

- **backend-api is not touched this time.** That is an explicit non-goal of relay-server-invite
  `00-requirement.md`.
- **The cloud invite path has no country slot at all.** The request types of `user.invite` and
  `user.invite-batch` have no `countryCode` field. The server has to move first.
- **The country does not arrive with an invite.** `MyInviteView` has no `countryCode`
  (`@lemoncloud/chatic-backend-api` `dist/view/types.d.ts:108`), so the accept screen cannot know
  which country's number an invite was issued for.
- **The device region is unknowable.** The app bridge has no locale/region channel (`region` and
  `country` in `libs/app-messages` `system.ts:111,117` are postal address fields). On the web side the
  only clue is the region subtag of `navigator.language`.
- `TextField` has no `leading` slot (`libs/web-ui-kit/src/foundations/input/TextField.tsx`).

## Decision

### 1. Support worldwide numbers and leave validation to `libphonenumber-js`

We do not maintain per-country valid lengths, number types, and `AsYouType` formatting ourselves. The
country code the library returns is the same ISO alpha-2 as the backend's `CountryCode`, so **we no
longer need to hold a dial code ↔ country mapping table.** That is the decisive reason the
own-table option was dropped.

Country **names** are not in the library. `Intl.DisplayNames` solves that on top of the existing ko/en
i18n with no bundle additions.

The `CountryCode` LUT from `@lemoncloud/chatic-backend-api` is **not pulled in.** relay-server-invite
`02-design.md` D4 nailed down that types going out to clients must not be tangled with an external
package, and that judgement applies to the app side as well. Final validation of the value is left to
the server's `400`.

### 2. Scope is two screens — phone verification and relay invite creation

| Screen                                   | Packet              | Included                |
| ---------------------------------------- | ------------------- | ----------------------- |
| `PhoneVerifyScreen` · `PhoneVerifySheet` | `auth.link-account` | ○                       |
| `ContactInvitePage`                      | `invite.create`     | ○                       |
| `AddFriendSheet` · `channels/InvitePage` | `user.invite`       | ✕ no slot on the server |
| `desktop-web` `InviteDialog`             | `user.invite`       | ✕ same reason           |

**Moving issuance and acceptance together is the core of this scope.** Attach the country to the
verification screen only, and an invite made as KR breaks the moment it is verified under another
country. The narrowed input type on `useRelayInvites` is opened up along with it.

### 3. Country selection UI — a button inside the field on the left, plus a search sheet

Add a `leading` slot to `TextField` and put a button there holding the flag, the dial code, and a
caret. Figma "General Input" keeps its single-line structure, and the ui-kit change ends with this one
item.

There are 250 countries, so the selection sheet is **a new component with search**. The existing
`LanguageSelectSheet` (two items listed) is no model for it.

### 4. The default country is `last selection → locale → empty box`

1. The previous selection left in localStorage
2. The region subtag of `navigator.language` (`ko-KR` → `KR`)
3. If neither exists, **leave it empty and let the user pick**

A value the user picked explicitly is the strongest signal, so it comes before locale. Someone living
abroad with a Korean-language device fixes it once and it stays.

**Empty is a first-class state.** With no country the number cannot be validated, so `Request code` is
disabled. Express that as a disabled control, not an error message — the user has not done anything
wrong yet.

### 5. Send full E.164 on the wire and add `countryCode` as a bonus

**Correction (2026-08-05, adjusted on this branch):** the original proposal followed the letter of
§contract in `05-client-guide.md` — "`countryCode` is the default country for local (`0…`) numbers" —
and chose the local form plus `countryCode`. But tracing the actual implementation in
`chatic-backend-api` (`asE164Phone` in `src/lib/auth/hash-alias.ts`) showed that `countryCode` is only
read when the number starts with `0`; when it starts with `+`, the implementation ignores `countryCode`
entirely and takes the string as E.164 as-is. So the local form plus `countryCode` combination relies
on `formatNational()` and per-country trunk rules (whether a leading 0 exists — for example NANP `+1`
only differs in digit count and gets no `0`), which means **there really are countries where the server
receives a string that is neither `+` nor `0` and throws a 400** (verified directly: `US`, `CA`, `CN`,
`BR`, `ES` among the 139 of 245 countries whose `formatNational()` has no leading 0). Sending full
E.164 always parses correctly regardless of whether `countryCode` is present — we keep sending
`countryCode` (the contract names the field, and sending it does no harm), but the value the server
actually uses is the E.164 one.

Send `parsed.number` from `libphonenumber-js` (E.164, including the `+`) as-is. **The wire value
changes for existing KR users too** — `01012345678` → `+821012345678`. The last4 check (decision 6,
`inviteLast4`) compares the last four digits, so it is unaffected.

**Sending the same country on send and on prove is the contract.** Treat the country as having the
same lifecycle as the number — changing the country invalidates the code that was sent (the same
handling as clearing `expiredAt` when the number is edited today). This stays valid after the wire form
becomes E.164 — if the country changes, the E.164 itself changes.

### 6. Fix two pieces of surrounding logic that assume KR

- **`"maskedPhone": "010-\*\***-{{last4}}"`** — `010-` is baked in as a literal on both the ko and en
  sides. For an invite to an overseas number it displays an area code that does not exist. Change it to
  a country-neutral form.
- **The `useSentInviteLog` key** — it is based on KR-normalized digits, so overseas numbers get a
  mismatched key and the reissue memory breaks. Use E.164 as the key. Existing keys are not migrated;
  they die out naturally (it is only a local convenience cache).

The `inviteLast4` check (`usePhoneVerify.ts:188`) is **not changed.** It compares the last four digits,
so it does not misbehave across countries — only false positives go up, and the server makes the final
call.

### 7. The new utility is attached to these two screens only

Build a new shared utility on `libphonenumber-js` and move only `PhoneVerify*` and `ContactInvitePage`
onto it. The three KR-only copies (`auth/utils/phone.ts` · `channels/utils/koreanPhone.ts` · the copy
inside the desktop `InviteDialog` file) and the fourth constant copy (`AddFriendSheet.tsx:53`) are
**left as they are.** The cloud path cannot receive a country on the server, so moving it gains
nothing and only grows the regression surface. Deduplication is left as a separate item.

## Alternatives

**Narrow supported countries down to a handful and hold our own table.** The bundle does not grow, but
every new country means hand-maintaining `{dialCode, length range}`, and per-country number types
(mobile/landline) cannot be distinguished. Having chosen worldwide support, this does not hold.

**Show the full country list but delegate validation to the server.** The least client code, but wrong
numbers burn the daily send limits (10 per number, 20 per device). Pre-validation is what protects
those limits.

**Just show the `+82` prefix visually.** The literal reading of the request, but it does not actually
support overseas numbers.

**Take full E.164 as input with no selection UI.** This no longer disagrees with the wire form (after
the correction in decision 5), but changing the input UX to E.164 too would break domestic users' habit
of typing `010`, or require a parallel paste-only path. Keeping the input in local form and converting
to E.164 only just before the wire gets the same accuracy with no UX change.

**Put the country selection on its own line, separate from the number field.** No ui-kit change needed,
but the screen grows taller and it departs from Figma's single-line structure. One `leading` slot is
cheaper.

**Let locale win over the last selection.** It treats the device setting as truth, but the value the
user fixed gets overwritten every time. An explicit choice is the stronger signal.

**Unify all three KR utility copies now.** The duplication goes away, but the regression surface spreads
into cloud invites, contact import, and desktop — and those paths cannot use a country.

## Consequences

**What is gained**

- Signing up, logging in, and inviting with overseas numbers becomes possible.
- Pasting `+82…` works on the auth screens too — an input that fails today.
- `countryCode` goes out as an explicit value rather than the server default. If the server changes its
  default, the app does not wobble.
- Maintaining per-country validation and formatting rules moves to the library.

**What is accepted**

- **The bundle grows.** About 30–40KB gzip for the `libphonenumber-js` min metadata. It is
  code-split onto the phone input screens rather than the whole app, to avoid the first-entry cost.
- **The accepter has to set the country themselves.** `MyInviteView` has no country, so the accept
  screen cannot know the invite's country. Combinations appear where `inviteLast4` passes but the
  country differs and the server rejects. The only mitigation is **a mismatch error message that names
  the country**. If the server carries `countryCode` on `MyInviteView`, the accept screen's default can
  be locked to the invite — requested separately.
- **The phone input path splits in two.** The relay path knows the country and the cloud path does not.
  This state holds until the cloud path gets server support, at which point it is resolved together with
  the utility unification.
- **A dependency on `Intl.DisplayNames`.** Modern browsers and WebViews have it, but a fallback showing
  the raw ISO code is needed when they do not.
- **One more piece of local state for the country selection.** It is kept in localStorage, so it is not
  shared across devices.

## Follow-ups

- Ask the backend for `countryCode` support on `user.invite` and `user.invite-batch`.
- Ask the backend to expose `MyInviteView.countryCode` (to lock the accept screen's default).
- Handle the unification of the three KR-only utilities plus the one constant copy as a separate item.
