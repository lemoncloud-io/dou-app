# ADR-0304: The core packages read no page

> Status: Accepted · Decided: 2026-11-11 · Implemented: `refactor/core-libs-platform-lint`
> · Scope: `tsconfig.lib.json` of `libs/{session,transport,sync,auth}`; root `eslint.config.mjs`
> (`PAGE_GLOBALS`); `libs/{transport,auth}/src/testing/platform.ts`; `xhrPut` moved from
> `libs/data/src/uploads/` to `libs/runtime-web/src/`; its importers in `apps/web` and `apps/desktop-web`
> · The behaviour is documented in [libs/runtime-core § Layers](../../libs/runtime-core/README.md#layers)
> · Supersedes in part: [ADR-0135](./0135-desktop-sends-images-through-the-runtime-image-send.md) — where
> `xhrPut` lives

## Context

ADR-0301 kept `@chatic/runtime-core` off the page: it compiles without the DOM's types. The core
packages beneath it — session, transport, sync, auth, data — were held only by the layer tags, which
say which package may import which and nothing about a global. Since then each page read in them has
become a port: the session's storage (ADR-0302), the transport's online signal, device and socket
factory, auth's address and the user agent it signs over. Nothing kept a new one from appearing; the
compiler still offered every DOM name, and the lint only refused `localStorage`/`sessionStorage`.

One page implementation also still lived in a core package: `xhrPut`, the `XMLHttpRequest` upload in
`@chatic/data`, which the web apps hand to the runtime as its `PutPort`.

## Decision

**A core package reads nothing of a page, and two checks hold it.**

1. **session, transport, sync and auth compile without the DOM.** Their `tsconfig.lib.json` sets `lib`
   to `es2022`; Node's types stay, for the timers, `URL` and `TextEncoder` that both runtimes provide.
   A name only a page has — `document`, `window`, `navigator`, `location`, `HTMLElement`, the
   IndexedDB types — is a compile error. Names React Native also declares — `WebSocket`,
   `XMLHttpRequest`, `File`, `Blob`, `fetch`, `requestAnimationFrame` — still type-check: React
   Native's global types reach these packages through `@chatic/data` → `@chatic/bridge-messages`. They
   exist in the native runtime too, so compiling is not wrong in itself; the ones that have to come
   through a port are refused by the lint below. Their shared test fixtures (`testing/platform.ts`)
   type the jsdom page by hand rather than bring the DOM back.
2. **All five refuse the page's globals in lint.** A root ESLint block over their sources bans
   `window`, `self`, `document`, `navigator`, `location`, `history`, `indexedDB`, `WebSocket`,
   `XMLHttpRequest`, `alert` and `confirm`, next to the storage pair it has to repeat (a later block
   that sets the same rule replaces its options). Tests are exempt.
3. **`@chatic/data` keeps the DOM's types for now.** Its IndexedDB port is declared in IndexedDB's own
   types (`IDBKeyRange`, `IDBValidKey`), and its upload types name `File`. For it the lint is the only
   check. The types go when the IndexedDB assembly moves out of the core.
4. **`xhrPut` moves to `@chatic/runtime-web`.** It is a page's implementation of a port `@chatic/data`
   declares; apps import it from the adapter, and data keeps the `PutPort` type.

## Alternatives

- **The lint list alone, for all five.** Simpler and uniform, but it misses every name not on the list
  and type-only uses of the ones on it; the compiler refuses every page-only name, typed or not.
- **No Node types either (`types: []`).** Stricter for `process` and `Buffer`, but `URL` and
  `URLSearchParams` would then be React Native's declarations alone — partial, with no `get` and no
  `set` — where today Node's merge with them, and correct code that uses them would stop compiling.
  The native entry replaces React Native's partial ones with a polyfill anyway.
- **Structural IndexedDB types in `@chatic/data` now.** Would let data drop the DOM too, but reshapes a
  port that is about to move; done twice for one result.
- **Leave `xhrPut` in data and exempt its file.** One exemption is how the next page read gets in.

## Consequences

- A page-only name in session, transport, sync or auth does not compile, and a page global on the
  list does not lint in any of the five. A `WebSocket` or `XMLHttpRequest` used only as a type passes
  both checks: React Native declares those types, and the lint sees only values.
- `xhrPut` is imported from `@chatic/runtime-web`; `@chatic/runtime-web` now depends on `@chatic/data`
  for the `PutPort` type.
- `process`, `Buffer` and the rest of Node's globals still type-check in the four packages. Nothing uses
  them, and Hermes has none of them; the lint does not list them.
- React Native's partial `URLSearchParams` is a gap the native entry's polyfills have to close; these
  checks do not show it, because Node's declaration merges over it.
