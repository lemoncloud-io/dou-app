# ADR-0298: Relay requests are signed in-house, and lemon-web-core is removed

> Status: Accepted · Decided: 2026-11-09 · Implemented: `feat/desktop-web-storage-ports` (its second commit)
> · Scope: `libs/http` (`signing/sigV4.ts`, `transport/requestTransport.ts`, `adapters/requestExecutor.ts`),
> `libs/transport` (`http/transport.ts`), `libs/auth` (`relaySession`, `sessionAuthAdapter`,
> `storage/lemonLeftovers.util.ts`), `libs/app-runtime` (`boot` group), `apps/desktop-web` (auth hooks),
> `apps/web` (`i18n`), root `package.json`
> · The behaviour is documented in [libs/http](../../libs/http/README.md) and
> [libs/transport docs/http](../../libs/transport/docs/http/README.md)

## Context

After ADR-0293, `@lemoncloud/lemon-web-core` held no credentials between pages, but it still held a
copy of the relay credential in memory for each page: `libs/auth` filled it from the relay token at
boot and after every renewal, emptied it at sign-out, and the app had to keep exactly one instance of
it, because two would split that copy. It also carried its own expiry clock, which nothing read any
more but which a call to its `isAuthenticated()` would have revived as a second refresh engine — kept
out only by hiding that method in a type. Its runtime dependencies included `aws-sdk` v2, past its end of
support. And what headers it sent was decided inside the
package (`x-lemon-identity` by a flag in its own store, `x-lemon-language` by a key name it looked up
under its own prefix), out of reach of this repo.

What the app actually used of it was two request builders: a plain one, and one that signs a request
for the relay's API Gateway (IAM auth) with SigV4 and adds `x-lemon-identity`, which the server reads.

## Decision

**The relay transport is ours: it signs every request from the session's relay token at the moment it
is sent, and lemon-web-core is removed.**

1. **`signRequest`** (`libs/http/src/signing/sigV4.ts`) re-implements lemon-web-core 1.5's vendored SigV4 client so
   that its output is the same byte for byte: the same signed headers (`Accept`, `Content-Type`, `host`,
   `x-amz-date`), the same body hashing (`JSON.stringify` of the body, `{}` when there is none, empty
   for GET), the same path and query encodings. The gateway has accepted exactly those bytes; a
   different, correct signer would still disagree somewhere, and a refused signature reaches the
   browser as a bare network failure. Golden tests pin it to signatures lemon-web-core produced for
   the same inputs at a frozen clock.
2. **`createRequestTransport`** (`libs/http`) builds the two builders over one axios instance. A signed
   request reads its credential, identity token and region through `RequestSigningPorts` when it is
   sent; with no credential it goes unsigned, as lemon's did, and says so. `libs/transport` binds the
   ports to `relayStore` and `@chatic/config`.
3. **Nothing is filled, emptied or booted.** `relaySession` no longer builds credentials on sign-in or
   boot, sign-out no longer clears a transport, `startWebTransportInit` is gone from the `boot` group,
   and the single-instance rule has nothing left to protect. The cleanup of lemon's old `@<project>.`
   keys stays, for bundles older builds left behind.
4. **Hashing is `@noble/hashes`**, synchronous and pure JS, not Web Crypto: `crypto.subtle` exists only
   in a secure context, and a development build on an Android emulator loads over `http://10.0.2.2`.
5. **`x-lemon-language` stays unsent**, as it already was in deployed builds; the web's write of the key
   lemon would have read is removed.

## Alternatives

- **Have the server accept a bearer token instead of IAM signing.** Better in the long run — the client
  would hold no AWS credential at all — but it changes authentication across the relay backend. Left
  as a later step; nothing here stands in its way.
- **A maintained SigV4 library** (for example the AWS SDK v3 signer). Correct, but not identical to what
  the gateway has been accepting: it signs a different header set and canonicalises the query its own
  way, so every request would have to be re-verified against production, and it is far larger.
- **Keep lemon-web-core and only stop filling its copy.** It reads its credential from `aws-sdk`'s global
  config, so it cannot sign without that copy; and the dependency problems would remain.

## Consequences

- One copy of the relay credential — the session's. A token the socket renews is used by the very next
  request, with no rebuild step to forget.
- `aws-sdk` v2 leaves the dependency tree with lemon-web-core; the `memory` medium has no runtime user.
  `crypto-js` stays: `libs/auth-sign`'s socket signature and the mobile shell still use it directly.
- Three edge cases differ from lemon on purpose. A path with a character outside the Basic Multilingual
  Plane, which made lemon's signer throw, is now signed. A relay token without a credential, which made
  lemon's credential build throw at sign-in, is now stored and its requests go out unsigned — what
  lemon did once a session ran without one. An empty identity token is left out of `x-lemon-identity`
  instead of being sent as an empty header.
- The signature is ours to keep correct. The golden tests fail on any byte that changes; changing the
  algorithm on purpose means regenerating them and checking against the gateway.
- desktop-web's sign-in hooks no longer await a transport boot before calling the server.
- ADR-0293's "lemon-web-core keeps none" is superseded: there is no lemon-web-core to keep anything.
