# ADR-0301: The runtime splits into contracts, assembly and platform adapters, held by lint

> Status: Accepted · Decided: 2026-11-10 · Implemented: `refactor/runtime-core-web-packages`
> · Scope: new `libs/runtime-core`, `libs/runtime-web`, `tools/eslint-rules`; root `eslint.config.mjs`,
> `tsconfig.base.json` (paths) and `tsconfig.json` (references);
> `nx.tags` in `libs/{session,transport,sync,auth,data,app-runtime}/package.json`;
> `libs/app-runtime` (`boot.ts`, `sessionStorageBoot.ts`, `public-surface.test.ts`)
> · The behaviour is documented in [libs/runtime-core](../../libs/runtime-core/README.md),
> [libs/app-runtime § Wiring](../../libs/app-runtime/README.md#wiring) and
> [tools/eslint-rules](../../tools/eslint-rules/README.md)

## Context

The session, the sockets, sync and the data layer run inside the web page in every app today. The
mobile app is to move them into its native process, with the WebView only rendering, while the
browser and the desktop shell keep them in the page. The same core code then has to run in two
places, and what differs between them — where the session is stored, how a socket is opened, what
"online" means — has to come in from outside it.

The core packages were cut out of `@chatic/app-runtime` one layer at a time (ADR-0253), but what they
run on is still decided by whoever gets there first. `initAppRuntime` takes every setting as optional
and falls back to a browser's answer (`sessionStorage` when no storage is passed). Each core package
is wired through a setter of its own — `sessionMedia.configure`, `syncDataGraph.provide`, and six
more — and any file can call one; each replaces what the last call set, so a second caller silently
undoes the assembly. Which package may depend on which is held by lists in each package's own
ESLint config — session refuses app-runtime, sync and auth refuse each other — but such a list names
importers one at a time, sees only direct imports, cannot name a package that does not exist yet,
and says nothing about React.

Moving the assembly code comes later and in steps. Each step has to land in a shape that is already
checked, or the first move that goes the wrong way is found only on a device.

## Decision

**Two packages are added before any code moves, and three rules make the shape a build failure rather
than a convention.**

1. **`@chatic/runtime-core`** holds what the runtime takes from a platform — `RuntimePorts`, one object
   with a field per port — and, once the assembly moves, the function that builds the runtime from it.
   **`@chatic/runtime-web`** is the web adapter: the package that fills those ports for a browser page.
   Both are packages, not folders inside `@chatic/app-runtime`, because Nx checks dependencies between
   projects and sees nothing inside one. A native adapter takes the same shape when it is needed.
2. **Layers are Nx tags, and their direction is `@nx/enforce-module-boundaries` constraints** in the
   root config:

    | Tag                   | Packages                             | May not depend on                                                                  |
    | --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
    | `layer:core-lib`      | session, transport, sync, auth, data | runtime-core, adapters, the React surface — even indirectly; React or React Native |
    | `layer:runtime-core`  | runtime-core                         | anything not tagged `layer:core-lib` (an allow-list); React or React Native        |
    | `layer:adapter`       | runtime-web                          | the React surface; React                                                           |
    | `layer:react-surface` | app-runtime                          | adapters                                                                           |
    | `platform:web`        | runtime-web                          | React Native                                                                       |

3. **Every port is required.** `RuntimePorts` has no optional field, and a compile-time assertion in
   its file fails the moment one is declared with `?`. A port left out has no neutral default — the
   only values within reach are one platform's — so forgetting one is a type error in the adapter, not
   a browser fallback inside the native runtime. It starts with the session's storage and grows a
   field for each wiring that becomes a port.
4. **The wiring calls are made in one file.** A workspace ESLint rule,
   `@nx/workspace-runtime-wiring-call` (`tools/eslint-rules/`), reports any of the eight wiring calls
   outside the assembly point, which today is `libs/app-runtime/src/init.ts`; tests are exempt. The
   catalogue and the allowed file are options in the root config, so moving the assembly into
   `@chatic/runtime-core` later changes one path. `setSessionStorage` is removed from the `boot`
   group: nothing called it, and as a public setter it was a wiring call any file could make through
   `runtime.boot`, out of the rule's sight.
5. **runtime-core compiles without the browser's types or Node's.** Its `tsconfig.lib.json` sets `lib`
   to `es2022` and `types` to none, so `window`, `navigator`, `localStorage`, an `HTMLElement`,
   `process` or `Buffer` there is a compile error. Its tests run in jest's `node` environment.

Nothing here changes what runs. The new packages are empty of behaviour, and the one removed export
had no caller.

## Alternatives

- **Sub-paths inside `@chatic/app-runtime`** (`./core`, `./web`). No new packages, but no constraint
  could tell them apart: the boundary check is per project, so a sub-path would be held by review alone.
- **A deny-list for runtime-core** ("not adapters, not the React surface"). Looser, and an untagged
  package — `@chatic/storage`, `@chatic/http`, `@chatic/bridges` — would pass unnoticed. The allow-list
  makes every new dependency a decision: tag the target, or don't take it.
- **`no-restricted-syntax` for the wiring calls.** It needs no new rule, but the root config already
  sets that rule for the storage ban, and a flat config replaces a rule's options when a later block
  sets it again — one of the two would go quiet depending on block order. A rule of its own has no
  such neighbour.
- **An inline rule in `eslint.config.mjs`**, as the log-tag check is. Nx lists `tools/eslint-rules/`
  among every project's lint inputs but not what the root config imports, so an inline rule could be
  changed without re-linting a project whose lint was cached. The folder also gives the rule a test
  target that CI runs.
- **A source-scanning test** (the shape `libs/auth-sign` uses for its purity check). It would catch the
  same calls, but only in a test run and with no location in the editor; lint reports at the call site.
- **Optional ports with web defaults**, as `AppRuntimeConfig` has. Convenient for the web, and exactly
  the fallback that would let the native runtime run on a page's storage without anyone noticing.
- **A dependency-injection container.** One object of ports, passed once by the entry point, is all the
  runtime needs; a container would add lookup by name where a missing field is now a compile error.
- **A lint list of browser globals (`no-restricted-globals`), keeping `dom`.** Every name would have to
  be listed, a type-only use (`let el: HTMLElement`) passes it, and the rule shares its options with
  the root config's storage ban. Dropping `dom` catches all of it with one line.

## Consequences

- A package runtime-core needs is either tagged `layer:core-lib`, which puts it under the core
  constraints too, or not used. `@chatic/storage` and `@chatic/http` are untagged today: the core libs
  import them, and they are not neutral yet.
- Not yet enforced, and left to the steps that move the code: core libs still import `@chatic/storage`
  and `@chatic/http`; browser globals and types are banned in runtime-core only; apps may import an
  adapter from any file, not only an entry point; `@chatic/app-runtime` still imports the core libs
  directly.
- React Native's global types still reach runtime-core: `@chatic/bridge-messages`, which `@chatic/data`
  imports, names React Native types, and their global declarations (`fetch` among them) come along.
  Both runtimes have those globals, so nothing wrong compiles today; it closes when the core packages
  stop reaching the bridge vocabulary.
- The indirect-dependency check reads the project graph Nx last computed. `nx lint` computes it first;
  running ESLint by hand after adding an import can miss an indirect edge until Nx runs again.
- A new wiring setter is caught only once it is added to the catalogue in the root config. The rule
  does not see a call through a computed member or a wiring function passed around as a value.
- A shell that learns only after boot that it keeps a vault cannot swap the session's media in
  place; it has to boot again with the right ones.
- `tools/eslint-rules` is a project with its own `test` target, and its folder is loaded by
  `@nx/eslint-plugin` by convention: every rule in it is offered as `@nx/workspace-<name>`.
