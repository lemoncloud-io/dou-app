// The `boot` facade group — what an app's ENTRY POINT touches, once, before anything renders.
//
// It has no module of its own on purpose: booting is not an engine (see docs/architecture.md's
// engine table — session · socket · http · sync · data), it is the act of handing those engines
// their configuration. So this file is a barrel and nothing else; the logic stays in the module
// that OWNS each piece (`init.ts` for the wiring, `data/` for the data policies, `http/transport`
// for the transport, `@chatic/web-config` for env).
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

// Env + platform. `ENV`/`PROJECT` come from the sole `import.meta` holder (ADR-0070 결정 6), so the
// isolation leaf stays a single file and apps still see one package.
export {
    LANGUAGE_KEY,
    WEB_ENV as ENV,
    WEB_PROJECT as PROJECT,
    WEB_SOCIAL_OAUTH_ENDPOINT as SOCIAL_OAUTH_ENDPOINT,
} from '@chatic/web-config';
export { isNativeApp } from './utils/isNativeApp';

// Native local-cache capability, reported by the bridge handshake AFTER boot — which is why it is a
// setter and not a field on `AppRuntimeConfig`. The web ships ahead of the app (see the deploy-order
// rule), so a domain the installed app cannot store is routed to web storage instead of a silent void.
export { setNativeCacheSupport } from './data/nativeCacheSupport';
export type { NativeCacheSupport } from './data/nativeCacheSupport';

// The sealed web transport. `startWebTransportInit` is a boot primitive that apps should NOT need:
// `connection.RuntimeConnectionHost` is the single init driver (see its doc). desktop-web's three
// auth hooks are the last callers, and it stays here only until they route through the host.
export { startWebTransportInit, webTransport } from './http/transport';
