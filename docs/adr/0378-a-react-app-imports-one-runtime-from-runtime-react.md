# ADR-0378: A React app imports one runtime, from runtime-react

> Status: Accepted · Decided: 2026-11-25 · Implemented: `refactor/libs-m3-1-runtime-react` (the import
> paths) and `refactor/libs-m3-2-react-split` (the React code moved out of `@chatic/runtime`)
> · Amends: [ADR-0376](./0376-the-runtime-is-one-headless-package-a-react-binding-and-platform-adapters.md)
> decision 1 (a React app's hooks came from a second import) and the consequence that amends
> [ADR-0346](./0346-every-app-starts-from-a-declaration-and-its-call-part-sees-only-the-runtime.md) decision 3
> · Scope: new `@chatic/runtime-react` (`libs/runtime/react`), `libs/runtime`, the call parts of `apps/web`,
> `apps/desktop-web`, `apps/admin` and `apps/landing`, root `eslint.config.mjs`
> · The behaviour is documented in [libs/runtime/react](../../libs/runtime/react/README.md)

## Context

ADR-0376 splits the runtime into a headless `@chatic/runtime` and a React binding, `@chatic/runtime-react`,
and says a React app imports `runtime` from the first and its hooks from the second. Today's apps do not
import hooks by name: they call them on the runtime object, `runtime.<group>.use…()` — 738 references, 181 of
them `runtime.data.useRuntimeRepositories` — and 545 source files (966 with their tests) import `runtime`
from `@chatic/runtime`. Taking the hooks off the object would rewrite every one of those references, and
every app file would then name two runtime packages instead of one.

## Decision

**A React app imports one name from one package: `import { runtime } from '@chatic/runtime-react'`.**
runtime-react's `runtime` has the same shape as the headless `runtime` with the hook groups added, the way
TanStack's react-query re-exports query-core. The domain names beside `runtime` and the test fake
(`@chatic/runtime-react/testing`) come from the same package.

- runtime-react re-exports the headless names under the same names and adds no new name for an existing
  symbol. A public-surface test, added with the step that moves the React code, holds its `runtime` to the
  headless `runtime` plus the hook groups; until then `libs/runtime`'s own surface test covers it through
  the re-export.
- A consumer with no React (a CLI, an MCP server) imports `runtime` from `@chatic/runtime`, which has no
  hook groups.
- The call sites stay as they are; only the import path changes. The first step moves every React app to
  `@chatic/runtime-react` while it still re-exports today's `@chatic/runtime`; the next moves the React code
  into it. A `runtime.<group>.use…()` left on the old path then fails to compile, because the headless
  `runtime` has no hook groups.
- An app's call part may not import `@chatic/runtime` or its subpaths (lint), so no file drifts back.
- The layer tag `layer:react-surface` becomes `layer:binding`, carried by runtime-react and, until its
  React code leaves, by `@chatic/runtime`, which then takes `layer:runtime`: no React, `@tanstack/*` or
  zustand.
- What only a page can answer — its address, the shell bridge, the user agent — is handed to
  `@chatic/runtime` by the platform adapter (`@chatic/runtime-web`'s `startRuntime`), so the headless
  package reads no DOM.

## Alternatives

- **Hooks imported by name from runtime-react, `runtime` from `@chatic/runtime`** (ADR-0376 as written).
  Rewrites the 738 references and gives every app file two runtime imports, for a split the apps do not need to
  see.
- **Keep the React facade under the name `@chatic/runtime` and give the headless runtime a new name.** The
  name a headless consumer reaches for first would be the one that pulls React in.

## Consequences

- ADR-0376 decision 1's "a React app also imports its hooks from `@chatic/runtime-react`" no longer holds;
  ADR-0346 decision 3, as ADR-0376 amended it, reads: a React app's call part sees `@chatic/runtime-react`.
- The import change touches 966 files in the four React apps (545 sources, the rest tests) and no call.
- The binding's ban on adapters is checked on direct imports only (an allow-list of every layer but
  adapter and app): checked through dependencies, `@chatic/runtime`'s test-only edge to `@chatic/db` failed
  every re-export.
- runtime-react is tagged `platform:web` for now: what it re-exports still reaches `@chatic/shared` (a web
  package) and the DOM. It becomes `platform:any` when those imports leave.
