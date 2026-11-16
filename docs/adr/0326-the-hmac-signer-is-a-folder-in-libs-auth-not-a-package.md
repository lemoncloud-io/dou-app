# ADR-0326: The HMAC signer is a folder in `libs/auth`, not a package of its own

> Status: Accepted · Decided: 2026-11-16 · Implemented: `refactor/auth-sign-into-auth`
> · Scope: `libs/auth-sign` (deleted), `libs/auth/src/signing/`, `libs/auth/src/session/utils/calcSignature.ts`;
> `tsconfig.base.json` (paths), `tsconfig.json` and `libs/auth/tsconfig.{lib,spec}.json` (references)
> · The behaviour is documented in [libs/auth docs/socket/signing.md § The formula](../../libs/auth/docs/socket/signing.md#the-formula)
> · Amends: [ADR-0070](./0070-app-runtime-session-hub.md) decision 2 and open question 5 — the signer
> stays a platform-neutral leaf, but as a folder inside `@chatic/auth` rather than a package

## Context

ADR-0070 created `@chatic/auth-sign` as a leaf package holding the lemon HMAC — the signature the
socket server recomputes on `auth.refresh`, `auth.update` and `auth.switch`. It had two reasons to be a
package. The formula was meant to be shared by the socket authentication and the HTTP layer, and its
natural-looking home, `@chatic/http` beside the SigV4 signer, would have made signing a socket depend on
the HTTP request stack. A leaf both sides could import kept either from dragging in the other.

Neither reason holds now. The HTTP side never used it: the same ADR left every credential refresh to the
sockets SDK's `ClientSocketAuth`, so no HTTP code computed this signature, and the HTTP signing that
ADR-0298 brought in-house is SigV4, a different signature. The package has one importer, `libs/auth`'s
`calcSignature.ts`, plus one test that mocks it. And `libs/auth` — the package ADR-0253 cut out to hold
the socket authentication — already depends on `@chatic/http` for other reasons, so there is no edge
left for a separate package to prevent.

What remained was the cost: a project in the Nx graph, a path alias, two project references and its
own jest and tsconfig setup for 54 lines of source. The survey that led here looked for libraries that
are split for no reason; of the 27 under `libs/`, this was the one whose split no longer guarded
anything — the rest are held by the layer tags and constraints of ADR-0253 and ADR-0301, by a native
shell that must compile one half without the other, or by more than one deployable consumer.

## Decision

1. **The formula moves to `libs/auth/src/signing/`** — `contracts.ts`, `LemonHmacSigner.ts` and a
   barrel — and `@chatic/auth-sign` is deleted with its alias and references. `calcSignature.ts`
   imports the folder by relative path, and the `@chatic/auth` barrel does not export it: nothing
   outside the package signs.
2. **The folder stays a leaf, held by a test instead of a package boundary.** `signing/purity.test.ts`
   reads the folder's non-test sources and fails on an import of any package but `crypto-js`, on a
   relative import that resolves outside the folder (dynamic `import()` and `require` included), and
   on a read of `navigator` or the clock. It also pins
   the list of files it scans, so a gate that stops seeing the formula fails rather than passing on
   nothing. This is the property of the old package worth keeping: the formula can still leave the
   repository in one move — into the sockets SDK, which is what asks for a signature — taking
   `crypto-js` and nothing else.

## Alternatives

- **Keep the package.** Free today, but it keeps paying a project's overhead for a boundary nothing
  crosses, and it reads as a reason that no longer exists.
- **Fold it into `@chatic/http` after all.** The SigV4 signer lives there, but this formula is not an
  HTTP concern and HTTP no longer uses it; it would make the socket signature an HTTP export and give
  `@chatic/http`, a leaf that imports no workspace package, a dependency on `crypto-js` for a caller
  that is not its own.
- **Inline it into `calcSignature.ts`.** One file instead of a folder, but the contract types and the
  purity gate would then guard a file that also holds the shared signer instance, and the folder is the
  unit that can be lifted out.
- **Hold the leaf rule with an ESLint override on the folder** instead of a test. ESLint's
  `no-restricted-imports` can refuse the packages but cannot express "no relative path out of this
  folder" without listing every sibling, and it has no rule for `new Date(`. The test already existed
  in this shape and moved with the code.

## Consequences

- `libs/` holds 26 projects. Nothing outside `libs/auth` imported the package, so no app or other lib
  changes.
- The formula's tests run in `libs/auth`'s jest project, which uses jsdom. The old project ran in
  `node` as evidence that nothing reads a global; that evidence was already weak — Node 21 and later
  ship a global `navigator` — and the source gate is what proves it.
- A later extraction into the sockets SDK is a move of one folder plus `calcSignature`'s import.
