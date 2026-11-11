// The `boot` facade group — what an app's ENTRY POINT touches, once, before anything renders.
//
// It has no module of its own on purpose: booting is not an engine (see libs/app-runtime/README.md's
// engine table — session · socket · http · sync · data), it is the act of handing those engines
// their configuration. So this file is a barrel and nothing else; the logic stays in the module
// that OWNS each piece (`init.ts` for the wiring, `data/` for the data policies, `@chatic/transport`
// for the transport, `@chatic/config` for env).
//
// Everything an app must decide at boot is reachable from `AppRuntimeConfig` below — including the
// two option types that used to force a consumer into `@chatic/data` to name them.

export { initAppRuntime } from './init';
export type { AppRuntimeConfig } from './init';
// The option types `AppRuntimeConfig.data` is made of. `DataRepositoriesOptions` lives in
// `@chatic/data`, and re-exporting it here is the point of a facade: an app configuring the runtime
// should not have to import the package the runtime assembles.
export type { DataRuntimeConfig } from './data/runtime';
export type { CacheAssemblyOptions } from './data/types';
export type { DataRepositoriesOptions } from '@chatic/data';

// `ENV`/`PROJECT`/`SOCIAL_OAUTH_ENDPOINT`/`LANGUAGE_KEY` used to re-export the sole `import.meta`
// holder's constants (ADR-0070 Decision 6, `@chatic/web-config`). That holder is retired (ADR-0079) —
// each Vite app now reads its own `import.meta.env` directly and calls `@chatic/config`'s
// `config.get(...)` for anything that IS a setting. The two former consumers split on exactly that
// line: `apps/web/src/i18n/index.ts` reads `import.meta.env` itself (a storage-key namespace is
// technical, not a setting), while `apps/desktop-web/.../oauth.ts` went to `config.get(...)` in
// ADR-0079 Step 6 — the OAuth relay host and the deeplink scheme are registry keys now. Either way
// routing them through this facade bought nothing.
export { isNativeApp } from './utils/isNativeApp';

// The session's storage. An entry point builds the stores for its environment and passes them to
// `initAppRuntime({ storage })`; one in an app or desktop shell that keeps a vault first awaits
// `prepareSecretStorage`, which loads the vault and moves secrets left in web storage into it.
// There is no setter to swap the stores after boot: the session's stores are wired once, in
// `initAppRuntime`, and a second wiring anywhere else would silently replace that choice.
export { prepareSecretStorage } from './sessionStorageBoot';
// The one place an app's stores are chosen and built. An entry point calls it once and hands the result
// out — to `prepareSecretStorage`, to `initAppRuntime({ storage })`, to its config ports and its own
// features — instead of constructing stores itself. apps/web and apps/desktop-web use it. `LATE_VAULT_MARK` is the tab mark it reads and that
// apps/web writes when a shell turns out to keep a vault only after its handshake.
export { LATE_VAULT_MARK, readStorageEnvironment, resolveStorageStores } from './storage/resolveStorageStores';
export type { StorageEnvironment, StorageStores } from './storage/resolveStorageStores';
export type { SecretStorageBoot, SecretStorageOutcome } from '@chatic/auth';
export type { SessionStoragePorts } from '@chatic/session';

// The relay HTTP transport — plain or signed requests; admin reaches the server through it. It needs no
// boot: each signed request reads the session's relay token at that moment.
export { webTransport } from '@chatic/transport';
