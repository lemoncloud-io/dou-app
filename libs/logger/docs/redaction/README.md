# redaction — masking, and the shapes an entry leaves in

> Overview in the [lib README](../../README.md) · Canonical code:
> [redaction/sensitiveKeys.ts](../../src/redaction/sensitiveKeys.ts) ·
> [redaction/valuePatterns.ts](../../src/redaction/valuePatterns.ts) ·
> [redaction/fingerprint.ts](../../src/redaction/fingerprint.ts) ·
> [serialization/wire.ts](../../src/serialization/wire.ts) ·
> [serialization/safeStringify.ts](../../src/serialization/safeStringify.ts)

An entry is masked when it is turned into an output shape, not when it is dispatched. That is why
these two directories are one topic: `serialization/` owns the shapes, `redaction/` owns the policy,
and every value that leaves the process passes through both.

**This is a safety net, not a licence.** The catalogue's rule stands — a caller does not put
credentials or personal data in an entry — and what is here only catches what is _recognisable_. A
value in an unusual shape goes straight through. Anything that relies on this to be safe is one odd
format away from shipping cleartext.

## Layout

```text
redaction/
  sensitiveKeys.ts   SENSITIVE_KEYS · SAFE_KEYS · REDACTED · isSensitiveKey · isSensitiveField · sensitiveFamilyOf
  valuePatterns.ts   redactText — url queries (SAFE_QUERY_PARAMS), then the shape rules
  redact.ts          maskSensitiveValue · redactSensitive · redactMaybeJson · truncate
  fingerprint.ts     the device salt (setRedactionSalt) · fingerprints · partial display · strict
  hmacSha256.ts      synchronous HMAC-SHA256, no dependency

serialization/
  safeStringify.ts    → string, masking everything it walks
  safeSerializable.ts → structure preserved, masking only what it takes apart
  wire.ts             → WireLogEntry, the server's shape
  serializeLogs.ts    → the same wire shape plus a total budget
  truncateText.ts     the one shortening rule both field caps share
```

## Two axes

### By name

`isSensitiveField(key, value)` is the verdict, and it has three parts.

1. **`SENSITIVE_KEYS`** — a case-insensitive **substring** match. `token` covers most bearer fields; the entries that do not contain it are listed separately (`x-lemon-identity`, `pwd`, `otp`, `secret`, `alias`, `code`). `code` and `alias` are there because a rejected verify-alias call logs its request body, which would otherwise ship a still-valid reset code next to the account's address. The tail of the list is the catalogue's forbidden-content names — `email`, `phone`, `receipt`, the push body and title fields. Nothing in the tree logs those today; they are there for the call site that has not been written yet. Names with a diagnostic homonym are deliberately absent: `body`, `text`, `content` and `name` would take `requestBody`, `statusText`, `contentType` and `tagName` with them.

2. **`SAFE_KEYS`** — an allowlist matched as an exact name **or a suffix**, so `httpStatusCode` is covered by `statuscode` without being listed. This exists because over-masking fails silently while under-masking eventually gets noticed: a secret that is visible gets reported, but a `[REDACTED]` sitting exactly where the answer was leaves a well-formed entry and no trace of the loss. `code` is the whole problem — it must stay on the sensitive list (it is the one-time verification code) and it matches `errorCode`, `statusCode`, `countryCode`, which is what a failure is diagnosed from. `responseCode`, `closeCode` and `httpStatus` are on it for the same reason.

3. **Presence flags** — a `boolean` under a name starting `has`/`is`/`are`/`was`/`were`/`can`/`should`/`allow(s)`/`need(s)`. These exist _because_ the value must not be logged: a caller who wanted to say "a token was present" without shipping it wrote a boolean. Masking that takes away what was bought and leaves the entry looking as if it had held the secret. The boolean check is the guard — a `hasToken` holding a string is not a presence flag whatever it is called.

`isSensitiveKey(key)` remains for callers holding a name alone, but prefer the two-argument form
wherever the value is in hand: it is the only one that can tell a flag from the secret it stands in
for.

What a sensitive value **becomes** is `maskSensitiveValue(key, value)`. It is `[REDACTED]` unless the
device's salt is set ([below](#fingerprints-and-partial-display)) and the name's family allows more
(`sensitiveFamilyOf`):

| Family  | Names                                                          | Becomes                                         |
| ------- | -------------------------------------------------------------- | ----------------------------------------------- |
| `token` | every match is a token name — `deviceToken`, `delegationToken` | `[TOKEN#b07e22]`, or `[JWT#…]` for a JWT        |
| `email` | every match is `email` — `email`, `userEmail`                  | `[EMAIL#9d0e11:@gmail.com]` or `[EMAIL#9d0e11]` |
| `phone` | every match is `phone` — `phone`, `phoneNumber`                | `[PHONE#a1b2c3:…5678]`                          |
| —       | passwords, one-time codes, secrets, keys, `authorization`      | `[REDACTED]`, always                            |

**Every** match has to agree: `passwordResetToken` also matches `password`, and a reset token is a
one-time code. A token value shorter than 16 characters gets no fingerprint — no real token is that
short, and short is what a fingerprint must not be taken of. A value that is not what its name
promises (an `email` with no address in it, a `phone` of fewer than nine digits) is `[REDACTED]`. A
value that is already a placeholder of the name's own kind, because the layer that wrote the entry
masked it first, is kept as it is — and only one in exactly the form the builders print.

### By shape

The name list only sees names, so it cannot help in the two places a secret most often ends up: a
free-form `message`, and a string whose key says nothing (`detail`, `reason`, whatever text a server
chose). `redactText` is the second axis, and it runs on **every** string.

Query strings go first. A url-ish token carrying `?` or `#` is rewritten so the **parameter names
survive and the values are masked**: which parameter holds the secret depends on the link that
produced it, so a deny-list of parameter names would be a guess, and the diagnostic value is in
_which_ parameters were present. The exception is `SAFE_QUERY_PARAMS` — `cid` `sid` `v` `version`
`provider` `tab` `page` `limit` `sort` `type` `view` `lang`, matched case-insensitively — whose values
are kept as written when they are plain (`[A-Za-z0-9._~-]`, at most 64 characters). Anything else under
those names — `?cid=1?token=…`, an encoded `@` — is masked like any other value. Each was among the most often masked names in real entries, none ever held a
secret, and `cid`/`sid` are the axes an entry is read by. `code` is not on it: it is an OAuth
authorization code or an invite code as often as anything else. A kept value still goes through the
shape rules with the rest of the text. A fragment goes whole, because auth flows put bare tokens there and
a fragment is not reliably `key=value`. Repeated names collapse. Three url forms are matched, because
all three appear in entries: absolute (`https://host/path?…`), scheme-with-opaque-body
(`sms:…?body=…`, `chatic://…`) and bare path (`/invite/accept?…`).

Then the shape rules, most specific first.

| Pattern                                                | Becomes          | With the device salt                            |
| ------------------------------------------------------ | ---------------- | ----------------------------------------------- |
| `eyJ…` base64url triple (a JSON-header JWT)            | `[JWT]`          | `[JWT#3f9a1c]`                                  |
| `Bearer <8+ chars>`                                    | `Bearer [TOKEN]` | `Bearer [TOKEN#…]`                              |
| FCM/GCM registration token (`:APA91b…`)                | `[TOKEN]`        | `[TOKEN#b07e22]`                                |
| `AKIA…` / `ASIA…` AWS key ids                          | `[TOKEN]`        | `[TOKEN]` — a key, not a token                  |
| An email address with a dotted TLD                     | `[EMAIL]`        | `[EMAIL#9d0e11:@gmail.com]` or `[EMAIL#9d0e11]` |
| E.164, then separated and bare domestic mobile numbers | `[PHONE]`        | `[PHONE#a1b2c3:…5678]`                          |

**Each match gets its own placeholder** — "an address was here" is itself the diagnosis, and
collapsing every kind into one word deletes the finding along with the value. `Bearer` runs after the
JWT rule so a bearer JWT reads as `Bearer [JWT]`.

Three exclusions are load-bearing.

- **Opaque high-entropy strings are not matched.** A rule like "20+ random-looking characters" would also eat ids, `cid`, `runId` and every uuid — the join axes the whole log system exists to follow. Losing those is worse than the risk it covers, and it fails silently.
- **The email rule requires a dotted TLD**, which is what keeps it off composite ids of the form `<channelId>@<userId>`.
- **The phone rules are anchored on a leading `0` or `+`**, so epoch milliseconds and other long numerals are left alone.

`redactText` returns its input unchanged when nothing matched, so a caller can compare identity to
learn whether anything was masked.

## Fingerprints and partial display

A bare `[JWT]` hides the token and also the one fact a token problem is diagnosed from: is this the
token from a minute ago, or a newly issued one? A support case asks the same of a number ("is this
the one you mean?") and of an address ("which provider?"). So with the device's salt set:

- **A token keeps a fingerprint** — the first six hex characters of `HMAC-SHA256(salt, token)`. The
  same token reads the same on one device, wherever it was found: a bearer value is fingerprinted
  without its scheme, so a header line and a `token` field agree. Nothing about the value can be read
  back from it.
- **A phone number keeps its last four digits**, and a fingerprint of its digits alone, so
  `010-1234-5678` and `01012345678` match. A number written with its country code (`+82 10…`) does not
  match its domestic form.
- **An address keeps its domain when it is a common mail provider's** (`COMMON_MAIL_DOMAINS`:
  `gmail.com`, `naver.com`, `kakao.com`, `daum.net`, `icloud.com` … matched case-insensitively and
  exactly, so a subdomain is not one), and a fingerprint of the lower-cased address always. A personal
  or company domain names its owner nearly as well as the local part, so `[EMAIL#9d0e11]` shows none.
  The local part is never shown.

**The salt belongs to the device and never leaves it.** Each install draws its own and keeps it; no
entry, field or statistic carries it. Across devices the same value prints differently, on purpose:
a salt shared by every client would ship inside every client, and with it anyone holding the logs
could hash every phone number there is and read the fingerprints back. Comparing across devices is
what `uid` is for.

The host sets it with `setRedactionSalt` at boot, before anything is serialized:

| Host           | Where the salt lives                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| app (native)   | MMKV, drawn on first launch; set by `attachNativeLogContext` — **none today**, see below                                        |
| app (WebView)  | injected by the shell as `CHATIC_APP_LOG_SALT`, so both runtimes agree; its own `localStorage` one while the shell injects none |
| standalone web | `localStorage`, per browser profile                                                                                             |
| anywhere else  | none — bare placeholders                                                                                                        |

A salt shorter than 16 characters is refused. Clearing the app's storage draws a new one.

**A salt comes only from a cryptographic random source** (`createRedactionSalt` reads
`crypto.getRandomValues` and returns `undefined` without it). Never `Math.random`: entry ids fall back
to it where `crypto` is missing, those ids are uploaded, a generator's state can be recovered from its
outputs, and a number with four digits shown has ten thousand candidates left. React Native's Hermes
has no `getRandomValues` today, so **the app's native side has no salt and masks bare** — and since the
app's upload queue is native, the web's entries inside the app end up bare too. The detail reaches the
logs from the standalone web only, until a native secure source exists.

**No salt, no detail.** Without a salt every placeholder is the bare form, and detailed ones that
arrive from elsewhere are folded back to bare. **`{ strict: true }`** asks for the same output with a
salt set, and also leaves out the safe lists added for the log pipeline's readers (query values,
`responseCode`, `httpStatus`); `redactText`, `redactSensitive`, `redactMaybeJson`, `safeStringify` and
`isSensitiveField` all take it. It exists for a sink outside the log pipeline — Crashlytics uses it, so
Firebase receives what it did before this.

**Masking twice gives the same text as masking once.** An entry is masked again each time it moves
into another shape (the app's store, then the upload), and a detailed placeholder carries a `#` that
the query rule would read as a url fragment — `token:[JWT#3f9a1c]` looks like a scheme with one.
`redactText` therefore shelves detailed placeholders while its rules run and puts them back after.
Only the exact forms the builders print are shelved — `[EMAIL#abcdef:jane@gmail.com]` is not one, so
the address inside it is still masked.

## The three output shapes

Pick by what the consumer needs, not by which is nearer.

| Function           | Output         | Masks                                                  | Used for                              |
| ------------------ | -------------- | ------------------------------------------------------ | ------------------------------------- |
| `safeStringify`    | `string`       | everything it walks, by name and by shape              | Any field being stored or sent        |
| `safeSerializable` | structure      | only the axios detail it takes apart                   | The bridge payload a debug UI renders |
| `toWireLogEntry`   | `WireLogEntry` | `data`/`error` via `safeStringify`; `message` directly | The server                            |

`safeStringify` is defensive first: circular references become `[Circular]`, `Error`s expand to
`{ name, message, stack }`, anything that still throws falls back to `String()`, and nullish input
returns `undefined` so the field can be omitted. Masking happens **inside the replacer**, so it
reaches nested objects and array elements, and the sensitive-key check runs **before** the `Error`
branch so a secret held under a sensitive key is masked whatever its type.

It also masks inside strings that are themselves serialized JSON (`redactMaybeJson`). Axios
stringifies a request body before the call fails, so a failed request's `config.data` arrives as one
opaque string where key-based masking would see only the key `data` and let the contents through.

`safeSerializable` keeps the structure because its consumer is the merged buffer a debug UI renders,
where collapsing to one string would destroy what the reader came for. It masks less by design: a
plain value is returned intact and masking is left to whichever boundary stores or sends it. What it
does dismantle is an axios error — `config` holds auth headers and the request body, so it is taken
apart field by field rather than spread, **headers are dropped entirely**, and the request/response
bodies are masked and truncated to `MAX_BODY_BYTES` (2048).

### The wire shape

```ts
interface WireLogEntry extends LogContext {
    id?;
    level?;
    tag?;
    message?;
    data?;
    error?;
    timestamp?;
    source?;
}
```

The context arrives by **extending** `LogContext` rather than relisting it, so the wire shape cannot
fall behind the contract, and `pickLogContext` copies the tuple as an allowlist. `compact()` then
drops every key whose value is `undefined`, so a stored record is never wider than the entry it came
from.

Three things about this mapper are easy to get wrong.

- **`message` is masked here, because nothing else can.** It never reaches `safeStringify` — it is already a string and goes straight to the field — so until this call it was the one part of an entry that left the device with no masking at all. Key-based masking is no help: a message has no keys. What it has is interpolated values, and a server's own error text lands there verbatim.
- **Masked _before_ the cap, never after.** Capping first would leave the tail of a long secret in place once the placeholder no longer fit.
- **There is no batch envelope.** The server stores one entry as one document and hoists the query axes off the entry itself, so `toWireLogBatch` is a flat `{ list }`.

Field caps: `WIRE_FIELD_CHAR_LIMIT` = 2,000 per stringified field. `truncateText` keeps the head and
appends `…(+N)`, so a reader can always tell a short value from a shortened one.

### The store shape

`SerializedLog` **is** `WireLogEntry` — `serializeLogs` maps through `toWireLogEntry` and adds only
what is genuinely its own: `TOTAL_CHAR_BUDGET`, 40,000 characters across the whole record. It walks
newest→oldest so the budget is spent on the most recent entries, stops at the first entry that does
not fit, and reverses to restore chronological order.

The two used to disagree. Storage kept only `level`, `tag`, `message` and `timestamp`, which cost the
whole occurrence-time context and the `id` — so every entry that outlived its process arrived at the
server with no user, no run, no version and no screen, and could never be acknowledged. Those are the
entries from a run that was killed or crashed, which is to say the ones most worth tracing.

## Where an unmasked value can still escape

- **A listener reading `entry.data` directly.** Masking lives in the serialization surfaces, so what a listener receives is the original. Crashlytics is the sink that does this and calls `redactSensitive` itself, `strict`.
- **Anything `safeSerializable` passes through.** By design — see above — but it means the bridge payload is masked only at the boundary that stores or sends it.
- **A shape the patterns do not recognise.** The caller's own rule is the first defence and there is no second one.

[`forbiddenContent.spec.ts`](../../src/redaction/forbiddenContent.spec.ts) is the test that guards the
**boundary** rather than the pieces: it puts each forbidden item through a real entry and asserts it
is absent from the wire output. The other masking suites check `redactText` and `isSensitiveField` in
isolation, and every piece being right is not enough — `message` not passing through `safeStringify`
was exactly that failure. Passing it is not permission to log the value.

## Usage

### Adding a sensitive key

1. Add the lowercase name to `SENSITIVE_KEYS` in `sensitiveKeys.ts`. Matching is substring, so check what else it will take with it — a name with a diagnostic homonym belongs in the comment explaining why it is absent, not in the list.
2. If a real field now collides, add its **suffix** to `SAFE_KEYS` rather than removing the sensitive entry.
3. Add a case to `forbiddenContent.spec.ts` when the item comes from the catalogue's forbidden list.

### Adding a shape rule

1. Add it to `VALUE_PATTERNS` in `valuePatterns.ts`, with its own placeholder, and place it above any more general rule it should win against. A placeholder that carries detail has to be added to the folding and shelving pattern in `fingerprint.ts` too, or strict output and repeated masking will break it.
2. Prove the negative as well as the positive: the test that matters is the one asserting the rule does **not** eat a uuid, a `cid`, a `runId` or an epoch timestamp.

### What not to do

- **Do not add a blanket "looks random" rule.** It eats the join axes.
- **Do not mask a field because the name sounds alarming.** Over-masking is the failure mode that never gets reported.
- **Do not move masking to the call site.** It would have to be right in every one of them, and the boundary is the only place where "right once" is possible.
- **Do not give a password, a one-time code or a secret a fingerprint.** They are short; with the salt, a fingerprint of one is a guess away from the value.
- **Do not log or upload the salt**, and do not replace it with one shared by every install.

## Further reading

- [docs/entries/](../entries/README.md#what-not-to-put-in-an-entry) — the caller's own obligations
- [docs/upload/](../upload/README.md) — the budget the wire mapper's output is measured against
- ADR-0224 — why masked values keep a fingerprint and a partial display, and what was rejected
