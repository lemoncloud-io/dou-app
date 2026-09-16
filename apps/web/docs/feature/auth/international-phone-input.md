# international-phone-input — choosing a country, and sending one

Every phone field in the app picks a country, validates the number against that country, and sends
the result as E.164 with the country alongside. This document owns that module: the pure helpers, the
country picker, and the rules the two consuming screens have to respect.

The screens themselves are elsewhere — [phone-verification.md](./phone-verification.md) for the
`PhoneVerify*` shells, [invite](../invite/README.md) for the issue form and the waiting screen.

## Layout

`apps/web/src/app/utils/phoneNumber.ts` sits beside `errors.ts` and `placeProfile.ts` — a pure
helper two features share. The picker is two files under `apps/web/src/app/ui/components/`:
`CountrySelectSheet` is pure presentation taking `{ open, onOpenChange, value, onSelect }`, and
`CountrySelect` owns the trigger and the sheet's open state.

Shipping them as one component is what lets a screen wire a country with a single prop.
`ContactInvitePage` needs that: it renders one fixed list of children on purpose, because a branch
that shifts child indices unmounts the live `PhoneVerifySheet` mid-promotion. A picker that is a prop
cannot break that; a sibling node could.

## Responsibilities

This module answers three questions and no others: which countries exist, is this a valid mobile
number for one of them, and what string goes on the wire.

It does not format as you type. The design specifies a raw digit field, so there is no `AsYouType`
formatter and the "digits only" copy stays accurate.

It does not own the country's lifecycle — the consuming screen does — but it defines what a country
change means: the same invalidation as retyping the number.

## The shared contract

### `apps/web/src/app/utils/phoneNumber.ts`

The module exports the country list (`listPhoneCountries`, all 245 the mobile metadata knows,
localized, sorted and memoized per language), the dial code, mobile-only validation, the wire value,
an international-paste parser, and the default-country resolution — the stored pick, else the
locale's region, else `null`, each checked with `isSupportedCountry`. `rememberCountry` writes
`dou.phoneInput.country.v1` and swallows a private-mode failure.

Two behaviours are not obvious from a signature: `isValidMobileNumber` is `false` whenever there is
no country, so an unfinished field never validates, and `toE164` assumes its caller already ran that
check — if parsing still fails it returns the input's digits.

There is no flag helper and no flag on a row: a picker row is the localized name plus the dial code.

**The backend's `CountryCode` union is deliberately not imported.** The client keeps `string` and
lets the server's 400 be the final judgement; binding a client type to an external package's union is
the coupling this rule exists to prevent. The library's own `CountryCode` is used as a type-only
import and cast at the boundary.

**The country list is the library's, not ours.** `getCountries()` returns the same ISO alpha-2 codes
the backend spells, so there is no mapping table to drift when a country is added.

Where `Intl.DisplayNames`, `Intl.Collator` or `Intl.Locale` are missing or throw, the ISO code stands
in for the name and the default collation applies. `toE164` assumes its caller already ran
`isValidMobileNumber`; if parsing still fails it returns the input's digits.

### Why `/mobile` and not `/min`

The flow delivers a code by SMS, so a landline must not pass. `libphonenumber-js/min` calls a Korean
landline valid; `/mobile` does not. The extra metadata is the price of not letting the world's
landlines into an SMS verification.

```bash
grep -rn "libphonenumber-js" apps/web/src libs --include='*.ts' --include='*.tsx' | grep -v node_modules
```

### The wire form is E.164

The backend's phone hasher applies `countryCode` only to a local (`0…`) number and takes a `+…`
string as it stands. Trunk-prefix rules split the world — a large share of countries have no leading
`0` in their national format — so "local form plus `countryCode`" is rejected for many of them. E.164
is the one form that does not depend on that split, and it is used for every country including KR.

`countryCode` still rides along: the documented contract names it, and it costs nothing.

The same string is the key of the local invite log and the number handed to the SMS composer. A local
form only reaches its destination when the sender's carrier is in the same country.

### A country change invalidates an outstanding code

A code sent to `+82 10…` is not the code for `+81 10…`. Changing the country runs the same
invalidation as retyping the number: the expiry, the send pin, the entered code, its error and the
link verdict are all cleared, and the code field re-locks.

The prove steps read the pinned `{ phone, country }` from send time, because the contract requires
the same country on send and on proof. Reading live state would make that depend on the invalidation
never missing a case.

### An international paste beats the picker

A pasted `+81…` is a country declaration more precise than the picker's, so the picker follows it and
the field is rewritten to the national form — one gesture enters both, and the picker and the field
are never left pointing at different countries. The pasted country is remembered like an explicit
pick. A partial `+8` simply parses to nothing and changes neither.

### An empty country is unfinished, not wrong

With no country there is nothing to validate against, so the request button is disabled and no error
copy appears — the user has not made a mistake yet. This happens when nothing is stored and
`navigator.language` carries no region subtag (`en` rather than `en-US`).

### The metadata must stay out of the entry chunk

The library is **not** in `vite.config.mts`'s `manualChunks` — that bundle is in the initial graph.
Instead every path that reaches it sits under a lazy chunk, and three places keep it that way:

1. **`apps/web/src/app/utils/index.ts` does not re-export `./phoneNumber`.** That barrel is on an
   eager path; re-exporting lifts the metadata into the entry chunk.
2. **`apps/web/src/app/ui/components/index.ts` does not re-export `CountrySelect*`.** Same reason.
   Both consuming screens import the concrete files.
3. **`RelayInviteAccept` imports `PhoneVerifyScreen` through `React.lazy`.** The other consumers
   (`ContactInvitePage`, mypage `LoginPage`, `AccountLinkSection`) already sit under lazy routes, but
   `CommonRoutes` deliberately keeps the invite-accept page eager — it is an invited person's first
   screen and must not pay for a chunk fetch. Splitting a _later_ phase preserves that: the verifying
   phase is only reachable after the accept screen has rendered.

Both barrels carry a comment saying so. Check the result rather than trusting the arrangement:

```bash
npx nx build web   # reportCompressedSize is on; the metadata belongs to PhoneVerifyFields-*.js
```

### The `leading` slot

`TextField` (web-ui-kit) takes a `leading` node rendered immediately before the `<input>`, mirroring
`trailing` at the other end. The container is already a flex row and the input is `min-w-0 flex-1`,
so nothing about the layout changes. Order inside the border is `leading → input → character counter
→ check icon → trailing`; the counter only renders with a `maxLength`, which the phone fields do not
pass.

The container's focus ring is `focus-within`, so focusing the country button rings the whole field.
That is intended — the country and the number are one input group.

### The sheet

`CountrySelectSheet` stacks on `BottomSheet`. Two choices are worth knowing:

- **The search box is the scroll container's first child, pinned with `sticky`** — there is no
  `header` prop on `BottomSheet`, and adding one would have meant a second ui-kit change on top of
  `leading`. It reuses the existing `SearchInput`.
- **No virtual scrolling.** 245 plain buttons, and the repo has no virtualization dependency; the
  contact list on the channels invite page renders the same way. Filtering is a `useMemo` over
  `toLowerCase().includes()` with no debounce.

Search matches the **localized name, the dial code (with or without `+`), and the ISO code**. The ISO
match is what makes a Latin query like `jp` work while the names are localized to Korean. Reopening
the sheet resets the filter — a stale one reads as a broken sheet.

## Usage

### Putting a country on a phone field

`CountrySelect` goes in `TextField`'s `leading` slot. The screen owns both halves of the
invalidation: the number's `onChange` must run `readInternationalInput` first and invalidate any
outstanding code, and the picker's `onChange` must call `rememberCountry` and invalidate the same
way. `usePhoneVerify` is the reference implementation of both.

### Sending

`toE164(phoneInput, country)` is the value sent, with `countryCode` alongside. `ContactInvitePage`
bundles the validated pair into an `IssueTarget` (`{ country, e164 }`) and every downstream call
carries it: `createInvite`, the local log's `record` and `findByPhone`, and the SMS composer. The
reissue dialog holds the same value.

### What not to do

- **Do not validate with a Korean-only helper.** `features/auth/utils/phone.ts` and
  `features/channels/utils/koreanPhone.ts` still exist; the cloud invite paths use the latter, and no
  international field may.
- **Do not re-export this module or the picker from a barrel.** See the metadata rule.
- **Do not send the local form.** `toE164` is the wire value everywhere.
- **Do not read the live field in a prove step.** Read the pin.
- **Do not treat a missing country as an error.** Disable the CTA.

## Notes for implementers and tests

- **The country pick is per device.** There is no server slot for it; `dou.phoneInput.country.v1` in
  localStorage is the whole of it.
- **The invite log key is E.164** (`dou.relayInvite.sentLog.v2`), and the first read removes the
  legacy `.v1` key so dead data does not linger. The hook writes localStorage directly — it does not
  use zustand `persist`, so there is no `migrate` hook; changing the key **is** the migration, and the
  entries are a local convenience cache, not a record.
- **A log entry carries no country field**, because the key already holds one. `InviteWaitingPage`
  recovers it with `readInternationalInput(entry.phone)` and reuses the key itself as the number. A
  key it cannot parse falls through to the "reissue without a log" path.
- **An accepter's country is not pinned to the invite.** `MyInviteView` carries no country, so a
  recipient's screen opens on their own locale. If `last4` happens to match, the send goes out and
  the server rejects the whole number with a 400 — which is why that copy names the **country and**
  the number.
- **`last4` comparison is unaffected by all of this.** The final four digits are the same in E.164
  and in the local form.
- **New i18n keys live under `phoneInput.*`** — `countrySheetTitle`, `countrySearchPlaceholder`,
  `countryPlaceholder`, `noResults`. The resources load remotely, so a missing key shows as a raw key
  rather than failing a build.
- **Jest needs no special configuration for the library.** Its `exports` map has no `browser`
  condition, so jsdom's `customExportConditions: ['browser']` does not match and the require path
  resolves to real CJS.

## How to verify

```bash
npx jest --config apps/web/jest.config.js --runInBand --watchman=false \
  --testPathPatterns "utils/phoneNumber|ui/components/CountrySelect|features/auth|features/invite|hooks/useSentInviteLog"
npx jest --config libs/web-ui-kit/jest.config.js --runInBand --watchman=false --testPathPatterns "TextField"
npx tsc -b apps/web/tsconfig.app.json
```

`phoneNumber.test.ts` fixes the rules that matter: a Korean landline is rejected, `toE164` of a local
Korean number is `+82…`, a `+82`/`+81` paste resolves, and the three default-country branches. The
screen suites fix the paste, the empty state, the country-change invalidation and that proving reads
the pin; the invite suites fix the payload, the E.164 log and the reissue path.

Those suites seed `localStorage` with a country in `beforeEach`, because jsdom's
`navigator.language` is `en-US` and would otherwise open on `US`. That is the production rule — last
pick wins — not a bypass.

## Further reading

- [phone-verification.md](./phone-verification.md) — the state machine that owns the country state
  and the send pin.
- [account-linking.md](./account-linking.md) — where `countryCode` lands in the packet.
- [invite](../invite/README.md) — the issue form, the local log and the reissue screen.
