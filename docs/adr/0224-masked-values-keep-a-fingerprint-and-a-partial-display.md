# ADR-0224: Masked values keep a fingerprint and a partial display

> Status: Accepted · Decided: 2026-10-23 · Implemented: `feat/log-collection-telemetry-masking`
> · Scope: `libs/logger/src/redaction/**` · `libs/logger/src/serialization/safeStringify.ts` ·
> `apps/mobile/src/app/services/log/native/**` · `apps/mobile/src/app/webview/**` ·
> `apps/web/src/app/runtime/logging/**` · the Crashlytics sink
> · Amends: [ADR-0050](./0050-redact-report-breadcrumbs.md) (a sensitive key's value was always
> `[REDACTED]`)
> · The module doc is [libs/logger docs/redaction](../../libs/logger/docs/redaction/README.md)

## Context

Masking finds secrets and personal data two ways — by the field's name (ADR-0050) and by the value's
shape (JWT, `Bearer`, FCM token, AWS key, email, phone, url query) — and replaces each with a word:
`[REDACTED]`, `[JWT]`, `[PHONE]`. What it masks was mostly right. How it masked deleted more than the
value.

- **A token problem could not be told apart from a token.** "Was this the same token as a minute ago,
  or a new one?" is how a refresh loop or a stale push token is diagnosed, and every token read
  `[JWT]`.
- **A support case could not confirm a number or an address.** "Is this the number you mean?" needs
  the last digits; "is this a delivery problem with that provider?" needs the domain.
- **Diagnostic values were masked as secrets.** A look at two weeks of production entries that
  contained `[REDACTED]` (7,888 entries, key names only) found:
    - `code` masked 6,597 times, almost all of them socket close codes and HTTP codes. `code` is
      also the one-time verification code, though, so the key stays masked; the fix is for those
      call sites to use `errorCode` or `closeCode`, which is the entries' own work.
    - `errorCode` 21 times and `responseCode` 10 times — over-masking.
    - `delegationToken` 496 times and `deviceToken` 54 times — tokens, where a fingerprint would
      answer the question above.
    - In url queries, `cid` and `sid` were masked 1,033 times each, `v` 945 times, `provider` and
      `version` 116 times each — none of them secrets, and `cid`/`sid` the axes an entry is read by.
      `code` appeared 189 times, and it can be an OAuth authorization code or an invite code.

Over-masking fails silently. A visible secret gets reported; a `[REDACTED]` where the answer was
leaves a well-formed entry and no trace of the loss.

## Decision

1. **A fingerprint for tokens.** A JWT, a bearer token, an FCM token, and a value of 16 characters or
   more under a name whose every sensitive match is a token name (`deviceToken`, `delegationToken`,
   `identityToken`, `accessToken`, `x-amz-security-token` …) become
   `[JWT#3f9a1c]` / `[TOKEN#b07e22]`: the first six hex characters of `HMAC-SHA256(salt, value)`. The
   value cannot be read back from it, and on one device the same token always prints the same.
2. **Nothing more for keys to an account.** Passwords, one-time and reset codes, secrets,
   `authorization` and AWS keys stay bare. A name that matches a token name _and_ anything else
   (`passwordResetToken`) is not a token. These values are short, or are keys in their own right, and
   a fingerprint of a short value can be matched by trying every candidate.
3. **Partial display for phone numbers and addresses.** `[PHONE#a1b2c3:…5678]` keeps the last four
   digits, and `[EMAIL#9d0e11:@gmail.com]` keeps the domain of a common mail provider — `gmail.com`,
   `googlemail.com`, `naver.com`, `kakao.com`, `daum.net`, `hanmail.net`, `nate.com`, `outlook.com`,
   `hotmail.com`, `live.com`, `icloud.com`, `me.com`, `yahoo.com`, `yahoo.co.kr`, exactly — while any
   other address is `[EMAIL#9d0e11]`. The local part is never shown. The same forms
   apply whether the value was found by shape or under an `email`/`phone` name; under a name, a number
   needs nine digits or more, so the four shown are fewer than half. The axis that finds a person is
   still `uid`.
4. **The salt belongs to the device and never leaves it, and comes only from a cryptographic random
   source.** Each install draws one and keeps it:
    - The app stores it in MMKV and injects it into its WebView beside the run id, so the web and
      native code print the same fingerprint for the same value. Like the run id injected beside it,
      it is readable by scripts on the page.
    - A standalone tab keeps its own in `localStorage`.
    - Where the runtime has no cryptographic source, no salt is drawn — never one from `Math.random`.
    - No entry, field or statistic carries the salt.
5. **No salt, no detail.** Without a salt, every placeholder is the bare form it always was.
6. **Firebase gets what it always got.** Crashlytics masks `strict`: no fingerprint or partial display,
   any detailed placeholder it is handed (from a request body the HTTP logger masked) folded back to
   bare, and none of the safe lists in decision 7, which are for the log pipeline's readers.
7. **Fewer false positives.**
    - `responseCode` and `httpStatus` join the safe key names. `errorCode` and `closeCode` were already
      on the list.
    - Url query values are kept for a safe list of names: `cid` `sid` `v` `version` `provider` `tab`
      `page` `limit` `sort` `type` `view` `lang` — and only a plain value (`[A-Za-z0-9._~-]`, at most 64
      characters), so `?cid=1?token=…` or an encoded `@` is still masked.
    - `code` and every other name stay masked, and a fragment is still masked whole.
8. **Masking stays where it was** — once, at the serialization boundary — and masking an already masked
   text gives the same text. That second property is new work: an entry is masked again each time it
   moves into another shape, and the `#` in a placeholder would otherwise read as a url fragment. What
   is let through as an existing placeholder has to be exactly a form the builders print, and under a
   sensitive name only one of that name's own kind, so nothing can pass itself off as one.

## Alternatives

- **One salt shared by every client.** It would let one value be matched across devices. But a salt
  shipped in every client is a salt anyone holding the logs can have. With it, every phone number in
  the country could be hashed and the fingerprints read back. Rejected.
- **A fingerprint for every masked value.** It would cover passwords and codes too. Their values are
  short, so a fingerprint of one is a guess away from the value once the salt is known. Rejected
  (decision 2).
- **WebCrypto's HMAC.** It is asynchronous, and masking runs inside `JSON.stringify`'s replacer and the
  wire mapper, which cannot wait. Hermes has no WebCrypto at all. A library would be the logger's
  first dependency. A synchronous implementation of about a hundred lines, pinned by the standard test vectors,
  was cheaper than either.
- **A safe list for url query values that includes `code`.** The report path does this, because a
  report is internal. Logs are uploaded and broadly read. Rejected.

## Consequences

- Logs and the report breadcrumbs built from them (ADR-0050) now carry the last four digits of a phone
  number and a common mail provider's domain. Whether that sits inside the diagnostic data the service already
  says it collects is a question for whoever owns that notice; this record only notes the widening.
- **A phone number's fingerprint is only as private as the salt.** With the last four digits shown,
  a domestic `010` number has four unknown digits left — ten thousand candidates, which anyone holding
  the salt can try in moments. Decision 2 refuses fingerprints to short values for exactly this
  reason; numbers get one anyway because telling one number from another is what support needs, and
  the salt never leaving the device is the protection. A salt that leaked would expose the numbers.
- **The app has no salt today, so in the app nothing changes yet.** React Native's Hermes offers no
  `crypto.getRandomValues`, and the only fallback, `Math.random`, is the generator the uploaded entry
  ids come from — its state can be recovered from its outputs, and with it the salt and every masked
  number. So the native side draws none and masks bare. The app's upload queue is native, and an entry
  stored there is masked by the native side, so the web's entries inside the app end up bare as well.
  Today the detail reaches the logs from the standalone web only. A native secure random source
  (`SecRandomCopyBytes` / `SecureRandom`, or a `getRandomValues` polyfill) turns it on in the app with no
  other change.
- A fingerprint is comparable within one device only. To follow a token across a user's devices,
  compare by `uid` instead.
- Clearing the app's storage draws a new salt. Fingerprints from before no longer match those after —
  the same as moving to another device.
- A personal or company domain (`@jane-doe.com`) names its owner nearly as well as the local part, so
  only listed providers show theirs. An address on an unlisted provider loses its domain too; adding a
  provider is a change to that list.
- `desktop-web` sets no salt and keeps the bare forms until it does.
- Every name and shape rule still only catches what it recognises. The caller's rule — do not put
  credentials or personal data in an entry — is unchanged.
