# ADR-0168: The cloud invite sends the country inside an E.164 number

> Status: Accepted · Decided: 2026-10-06 · Implemented: `feat/cloud-invite-international-phone`
> · Scope: apps/web `features/channels` (`AddFriendSheet`, `utils/deviceContact`), `app/utils/phoneNumber`
> (`readMobileNumber`, `readLocaleCountry`) · retires `features/channels/utils/koreanPhone`
> · Amends: [ADR-0044](./0044-international-phone-input-country-code.md) — its cloud-invite scope
> note, decision 7 and the "phone input path splits in two" consequence
> · The module docs are [apps/web channels/invite.md](../../apps/web/docs/feature/channels/invite.md)
> and [apps/web auth/international-phone-input.md](../../apps/web/docs/feature/auth/international-phone-input.md)

## Context

ADR-0044 gave the relay 1:1 invite and phone verification a country picker and left the cloud
invite — a room invite or a place invite, `user.invite` and `user.invite-batch` — Korean-only. Its
reason was the server: neither request has a `countryCode` slot, so the cloud path "cannot receive a
country", and moving it onto the new utility "gains nothing". It promised a separate ADR once the
backend followed.

The backend did not need to follow. What the server actually does with the number is:

- `user.invite` passes `phone` through to the backend as the invite's alias. The backend's phone
  model stores an E.164 `+1…` as it is and turns `+82…` into the local `010…`, so a Korean number
  sent as E.164 lands on the same record a local one did.
- `user.invite-batch` sends its texts through the SMS relay's batch endpoint, whose international
  branch accepts E.164 numbers.
- Accepting a cloud invite never checks the number.

So the country never needed its own field. A number that starts with `+` carries it, and the contact
tab had in fact been sending Korean numbers as `+82…` already. Meanwhile someone whose friend has a
foreign number — typed in, or saved in the address book — could not invite them at all.

## Decision

### 1. The cloud invite validates per country and sends E.164

`AddFriendSheet` gets the same country picker and validation as the relay invite's field: a mobile
number for the picked country, a pasted `+81…` moving the picker, and `toE164` as the value sent.
Mobile only, because every invite reaches its recipient as a text. `koreanPhone.ts` has no caller
left and is removed.

### 2. A contact's number is read in its own country, else Korea, else the device locale

A number saved with a `+` names its country. One saved without is tried as Korean first, then as the
device locale's region. Korea first because nearly every address book this app reads was filled in
there, and because then no contact that was invitable before reads any differently — the order can
only add invitable contacts. The locale second because a local number is local to whoever saved it.

The phone fields' remembered country (`resolveDefaultCountry`'s stored pick) is deliberately not a
guess here. It names the country of the last person invited by hand, not the owner's address book,
and picking Japan once would otherwise turn every saved `010-…` into a Japanese number that fails.

### 3. The row shows where the text will go

A Korean mobile is shown as dialled at home (`010-1234-5678`), any other with its country code
(`+1 415 555 0123`). When Korea took a number that the locale's country would also have taken —
`0171 2345678` on a German device is a German mobile and, read as Korean, `017-1234-5678` — it is
still invited as Korean, but shown as `+82 17 1234 5678`, so the guess is on screen before a text
goes out.

### 4. The sheet falls back to Korea

The sheet opens on the remembered pick, then the locale's region, then Korea. ADR-0044 §4 leaves the
relay field empty in that last case; the cloud sheet took Korean numbers alone until now, and a
region-less locale (`ko`) must not turn its most common case into "pick a country first".

## Alternatives

- **Wait for a `countryCode` slot on both requests**, as ADR-0044 planned. Nothing on the server
  would read it differently from the `+` prefix, and foreign numbers would stay blocked until then.
- **Read numbers saved without a `+` in the remembered country.** Rejected for the reason in
  decision 2: that pick describes the last invitee, not the address book.
- **Locale first, Korea second.** Right for a phone that lives abroad, but every Korean user on an
  English-language device (`en-US`) would then see their `010-…` contacts tried as American first;
  they parse as nothing there and fall through to Korea, but a German or Egyptian locale would read
  some Korean numbers as local ones and change who already-invitable contacts reach.
- **Treat a number both countries accept as uninvitable.** Safest against a wrong country, but it
  would take invitable contacts away from people abroad whose address books are Korean.
- **Show every number in international form whenever the locale is not Korea.** Simpler than
  decision 3, but a Korean user on an English-language device would see `+82 10 …` on every row
  for no ambiguity at all.

## Consequences

- The phone input path is one path again: every phone field in apps/web validates through
  `utils/phoneNumber.ts`. `features/auth/utils/phone.ts` stays as an unused Korean-only helper.
- **Korean validity follows the library's metadata, not the old prefix list.** `012-…` (an M2M range)
  now passes and a small `010-597x`–`599x` block is refused — the same as the relay invite already
  does.
- **Delivery of foreign batch texts depends on the SMS relay's international branch** being the one
  deployed; a relay without it fails those numbers.
- **A Korean reading still wins an ambiguous number.** Decision 3 makes it visible; it does not make it
  right for a German address book. A device that lives abroad and saves numbers without `+` should
  expect to check those rows.
- **The remembered country is shared with the user's own verification.** Picking Japan in the cloud
  sheet makes the login screen open on Japan, and the reverse. The relay field already behaved this
  way.
