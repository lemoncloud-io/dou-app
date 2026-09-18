# ADR-0107: The encoded `/i` invite link — one decoder, and an entry path kept apart from `/s`

> Status: Accepted · Decided: 2026-09-18 · Implemented: `b692d2b7` · Scope: `libs/shared/**` · `apps/landing/**` · `apps/mobile/**` · `apps/web/**`

## Context

Invite links are now issued in a second shape. The existing one, `/s?code=…&api=…&stage=…`, spells
the target out in the query string — the invite code, plus the API Gateway id and stage of the cloud
holding it. The new one, `/i?t=<base64url(JSON)>`, packs the same values into a single opaque token,
so the endpoint is no longer legible in a link that gets pasted into a chat room.

Four entry points read an invite link, and at `dcc98b76` every one of them knew only `/s`. Each
failed differently:

- **landing** — `useWebRedirect` gated its invite branch on `pathname === '/s'`. A `/i` link matched
  neither that nor the short-code pattern, so it reached the "unsupported deep link" dead end: the
  page rendered and the user was not moved anywhere.
- **mobile** — `convertShortUrlWithEnvsSync` matched neither the `/s` pattern nor the retired
  short-URL one, so `/i` passed through unconverted. On its own that is harmless: `resolveWebPath`
  reduces an unrecognised link to `pathname+search+hash` and hands that to the WebView intact.
- **web** — this is where the invite was actually lost. There was no `/i` route, so the link fell to
  the router's `*` fallback, `<Navigate to={ROUTES.root} replace />`. That target is a bare `/`: the
  query string, and with it the entire invite, was dropped with nothing left to recover it from.
- **Android** — the verified intent-filters in `AndroidManifest.xml` covered `/s/.*` and `/auth/.*`
  and nothing else, so a `/i` link never reached the app at all.

iOS was the exception in the other direction. The entitlements claim `applinks:app.chatic.io` and
`applinks:app-dev.chatic.io` as whole hosts, so the association file claims every path on them. The
link did open the app; it then failed one layer further in, at the parser that did not know `/i`.

So the same link had four different failure modes, and the one that mattered — silent loss of the
invite — was not on the platform the link was aimed at.

## Decision

### 1. One decoder, in `libs/shared`

`libs/shared/src/utils/inviteLink.ts` is the only place the `t` token is opened.
`isEncodedInviteUrl` answers "is this one of ours" from the path alone; `decodeInviteLink` opens the
token and returns `{ code, relay, backend? }`. Landing, mobile and web all call it.

Three decoders would have been the smaller change, and the reason not to write them is not tidiness.
The token carries the address of the server holding the invite. A decoder that drifts from its
siblings does not degrade — it resolves one link to a _different server_ than the other two do, and
every layer downstream behaves correctly on the wrong answer.

The decoder is written without `atob`, `TextDecoder` or `Buffer`. None of the three is a language
guarantee: `atob` rejects the url-safe `-` and `_` outright, and React Native ships no polyfill for
either, so their presence on a device is a property of the JS engine build. Base64 is accumulated
arithmetically and UTF-8 is walked by hand, so the same bytes decode identically under jest and on a
phone. UTF-8 specifically, not a latin1 shortcut: invite payloads carry cloud and place names, which
in this product are usually Korean, and a shortcut would mangle them silently instead of failing.

### 2. `/i` is a separate branch, and the `/s` parser is not touched

Each entry point checks `/i` ahead of its `/s` branch and returns before reaching it. The web has its
own route component, `EncodedLinkRedirect`, beside `ShareLinkRedirect`; the conversion lives in
`buildEncodedInviteEntryParams`, beside `buildInviteEntryParams`.

The two formats cannot share a parser, because they disagree on exactly one rule and the
disagreement is not cosmetic. On `/s`, **the absence of an address is itself the relay signal** — the
relay server has none to carry, so a code-only `/s` link is a relay invite by convention. On `/i` the
payload states relay outright in `r`. A `/i` payload with no `r` and no coordinates is therefore not
a relay invite; it is a cloud invite whose coordinates went missing. Reading it by the `/s` rule
would route the invitee to a server on which the invite does not exist.

So an address-less `/i` payload is forwarded unmarked — no `relay`, no `_backend` — and the web owns
what happens next. `inviteEntryParity.test.ts` pins both halves: the same invite carried either way
produces the same entry params, and the one case where the two are _meant_ to diverge diverges.

### 3. `android:path="/i"`, an exact match

Not `pathPrefix`, not `pathPattern`. The link is `/i?t=…`, whose path is exactly `/i` — a query
string is not part of the path — so nothing is gained by a prefix, and a prefix would also claim
`/invite/accept` and every `/images/…` URL on the same host, pulling pages into the app that were
never meant to open there.

The opposite mistake is already in the file, two filters up. `/s/.*` was written for a link shape
that no longer exists; today's link is `/s?code=…`, whose path is just `/s`, which that pattern does
not match. The result is that `/s` links reach the app only by way of the landing page. Verified on
an emulator after this change: a `/i` link opens the app, a `/s?code=` link opens the browser.

iOS needs no counterpart — see above, its association file already claims every path.

### 4. The decoder returns `null`; query strings are assembled as text

`decodeInviteLink` never throws. Landing's redirect hook catches errors into a silent
`setLoading(false)`, so a decoder that threw would leave the user watching a page that had quietly
given up. `null` is the single "cannot read this" answer and each entry point decides what to show
for it — landing logs and stops, web falls back to `/`, and mobile converts it into the `invalid`
resolution that its error screen already handles.

Query strings are built by concatenating strings, never by mutating a `URL`'s `searchParams`. React
Native's `URL` derives `.search` from the raw URL string and ignores `URLSearchParams` mutations, so
`${url.pathname}${url.search}` returns everything that was set — minus everything that was set. The
`/s` path has a comment recording that this already happened once: Node and jest reflect the
mutation, so the unit tests stayed green while devices silently dropped the invite params. The new
branch follows the same rule rather than rediscovering it.

### Deliberately out of scope: validating or signing the payload

The decoder does not verify the payload and nothing else does either. Anyone holding the link can
decode it, edit the address inside and re-encode it — the token is an encoding, not a signature.
That is equally true of `/s?api=…` today, where the address is simply written out in the clear. The
new format hides the endpoint from a casual reader; it does not stop anyone from changing it, and
those are different properties.

A check in the decoder would not close that gap, since the client cannot tell a legitimate address
from a plausible one. It would only make the gap look closed, which is worse than leaving it visible.
If forged payloads have to be refused, the refusal belongs where the invite is redeemed, not where a
link is read.

## Alternatives considered

**A decoder per app.** No shared-library change, no project reference to add, three small functions
instead of one. Rejected for decision 1's reason: the failure mode of drift here is not a broken
screen, it is a correct-looking screen pointed at the wrong server.

**Reuse the `/s` parser by mapping `/i` onto its params.** Attractive because the output shape is
already identical. Rejected because the input rules are not: it would import the "no address means
relay" inference into a format that states relay explicitly, and misroute exactly the payload that
most needs care.

**`android:pathPrefix="/i"`.** More forgiving of a link shape that grows a path segment later.
Rejected: it silently claims `/invite/…` and `/images/…` on the same host. The filter two lines above
it is a live demonstration that a permissive path pattern written for an imagined future link is not
free — it is still there, still not matching today's link.

**Validate the payload in the decoder.** Rejected as described above: no client-side check can
distinguish a forged address from a real one, so the check buys an appearance of safety and nothing
else.

## Consequences

**Gained.** One link converges on one set of invite-entry params across three entry points, and a
parity test holds it there rather than a convention. Android opens `/i` links directly, exactly and
only `/i`.

**Already-installed apps work as soon as the web bundle ships.** A native build that predates this
format has no branch for `/i`, so it falls through to the pass-through path and hands the WebView
`pathname+search` — which the new `/i` route on web now answers. A store release is not a
precondition for the link working; it only removes the extra hop. This is the difference between the
web route and landing's, and the reason both exist.

**Paid.** Two link formats in circulation until `/s` retires, with two parsers and two conversion
functions that must keep producing the same output. The parity test is what makes that survivable,
and it is also the only thing that does.

**Left unresolved, knowingly.** A `/i` payload carrying a code but no coordinates and no `r` is
forwarded unmarked, and the invite-entry screen renders for it like any other invite. The fact that
there is no server to attach to surfaces only after the user accepts. That is better than the
alternative on the table — guessing relay and sending them somewhere the invite does not exist — but
it is not a good outcome, only a recoverable one. Deciding what that screen should do is open work.

**Build.** `apps/landing` consumed `@chatic/shared` for the first time, which needed the library
added to `tsconfig.app.json`'s project references. The path mapping alone is not enough — `nx build`
refuses the app without the reference, and nothing else in CI reports the omission first.
