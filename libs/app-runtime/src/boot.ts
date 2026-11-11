// The `boot` facade group — what an app's ENTRY POINT touches, once, before anything renders.
//
// It has no module of its own on purpose: booting is not one of the runtime's parts (see
// libs/app-runtime/README.md's table — session · socket · http · sync · data), it is the act of handing
// them their configuration. So this file is a barrel and nothing else; the logic stays in the module
// that OWNS each piece (`init.ts` for the wiring, `data/` for the data policies, `@chatic/transport`
// for the transport, `@chatic/config` for env).
//
// The runtime itself is built by the platform's adapter — `createWebRuntime(...)` from
// `@chatic/runtime-web` in a page — and handed here as an engine.

export { initAppRuntime } from './init';

// `ENV`/`PROJECT`/`SOCIAL_OAUTH_ENDPOINT`/`LANGUAGE_KEY` used to re-export the sole `import.meta`
// holder's constants (ADR-0070 Decision 6, `@chatic/web-config`). That holder is retired (ADR-0079) —
// each Vite app now reads its own `import.meta.env` directly and calls `@chatic/config`'s
// `config.get(...)` for anything that IS a setting. The two former consumers split on exactly that
// line: `apps/web/src/i18n/index.ts` reads `import.meta.env` itself (a storage-key namespace is
// technical, not a setting), while `apps/desktop-web/.../oauth.ts` went to `config.get(...)` in
// ADR-0079 Step 6 — the OAuth relay host and the deeplink scheme are registry keys now. Either way
// routing them through this facade bought nothing.
export { isNativeApp } from './utils/isNativeApp';

// The session's storage. An entry point builds the stores for its environment (`resolveStorageStores`
// in `@chatic/runtime-web`) and passes them to `createWebRuntime({ storage })`; one in an app or desktop
// shell that keeps a vault first awaits `prepareSecretStorage`, which loads the vault and moves secrets
// left in web storage into it. There is no setter to swap the stores after boot: the session's stores
// are wired once, when the runtime is built, and a second wiring anywhere else would silently replace
// that choice.
export { prepareSecretStorage } from './sessionStorageBoot';
export type { SecretStorageBoot, SecretStorageOutcome } from '@chatic/auth';
export type { SessionStoragePorts } from '@chatic/session';

// The relay HTTP transport — plain or signed requests; admin reaches the server through it. It needs no
// boot: each signed request reads the session's relay token at that moment.
export { webTransport } from '@chatic/transport';
