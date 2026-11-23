# ADR-0371: Jest compiles `import.meta` and fails a test that reaches what jsdom cannot do

> Status: Accepted · Decided: 2026-11-23
> · Scope: `tools/jest/**` · every `apps/*/jest.config.js` and `libs/*/jest.config.js`
> · Builds on: [ADR-0046](./0046-web-feature-ownership-and-barrel-hygiene.md) (its open `import.meta` consequence)

## Context

Between 2026-10-24 and 2026-11-23, 26 of 347 merged pull requests failed their first `verify` run. The test
step failed for three causes that kept coming back, each patched where it surfaced:

- **`import.meta` under ts-jest.** ts-jest compiles to CommonJS, where `import.meta` is a syntax error. A Vite
  module that reads `import.meta.env`, reached through any barrel, stops every spec that imports the barrel
  from loading. One such import failed eight pull requests in a row on the same eight suites. Each fix mapped
  or mocked one more module, and the web docs grew rules about which barrels a test may import.
- **`TextEncoder` missing in jsdom.** The socket library reads it at import time. Ten projects carried a
  copied polyfill in their own `jest.setup.ts`; `libs/db` did not, and failed the day a test first reached the
  socket library.
- **jsdom's "not implemented".** A page navigation or a media call is printed as a console error and the test
  passes anyway, so a test can claim a flow it never ran. The only signal was noise in every CI log.

## Decision

1. **One ts-jest transformer compiles `import.meta`** (`tools/jest/import-meta-transformer.js`) in every
   ts-jest project: `env` is a production build (`MODE: 'test'`, `DEV: false`, `PROD: true`, `SSR: false`,
   `BASE_URL: '/'`, as the old stubs answered), built fresh at each read; `url`, `filename` and `dirname`
   are the module's own. A module may read `import.meta` and still be unit tested.
2. **One jsdom environment** (`tools/jest/jsdom-environment.js`) for every jsdom project and every test that
   opts into jsdom by docblock. It provides Node's `TextEncoder` and `TextDecoder`, and fails the test
   during which jsdom reported "not implemented", naming the API; a report after the last test (an
   `afterAll`, a late timer) fails the file instead. A test stubs the navigation or media call through a parameter or prop with a browser
   default, as `StorageKeyBrowser`'s `reload` already did.
3. **`tools/jest/adoption.spec.js` holds every jest config and docblock to both**, so a new project or test
   cannot start on bare `jsdom` or a ts-jest transform without the transformer.

## Consequences

- The ten per-project `TextEncoder` polyfills are gone.
- The module mappings and mocks that existed only to keep `import.meta` out of tests (`buildEnvMock.js`,
  per-spec `jest.mock` of `buildEnv`) still work; removing them is optional cleanup, not required. Source
  comments that still say the test transform cannot parse `import.meta` are now false; they go with the
  comment cleanup of each project.
- Editing the transformer means bumping its `version`, which is part of ts-jest's cache key. Nx does not
  list `tools/jest/` among a project's test inputs, so a local cached `nx test` can replay a result from
  before an edit to these files; CI has no remote cache and runs every project when `tools/` changes.
- `adoption.spec.js` lives outside `apps/` and `libs/`, so it runs when `tools/` or a root file changes and on
  full runs, not on a pull request that only touches one project's `jest.config.js`.
- Vitest projects (`apps/admin`, `apps/desktop-web`, `apps/landing`, `apps/shell-adapter`) compile
  `import.meta` natively and are not covered by the jsdom rule.
