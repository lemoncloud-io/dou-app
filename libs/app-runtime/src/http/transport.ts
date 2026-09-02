import { createLemonWebTransport } from '@chatic/http';
import { usePersistentWebStorage, WEB_ENV, WEB_OAUTH_ENDPOINT, WEB_PROJECT, WEB_REGION } from '@chatic/web-config';

import type { SealedWebTransport, SealedWebTransportBundle } from '@chatic/http';

/**
 * The runtime's ONE lemon transport — assembled here, built in `@chatic/http`, configured from
 * `@chatic/web-config`.
 *
 * Ownership used to sit in `web-config` because the instance needs four env-derived inputs and
 * web-config was the only leaf both `web-core` and this lib could bite. That made the repo's env
 * leaf hold a live SDK instance, a token store and a module-load boot. The split now follows the
 * dependency rule instead of the import graph: `@chatic/http` owns construction and boot policy
 * (it reads no env), this file owns the values and the singleton (it is the assembly point, the
 * same role it plays for `HttpManager` next door in `factory.ts`).
 *
 * **Two instances would split the session.** The lemon token storage lives inside the instance, so
 * a second one means two stores. That is why `@chatic/http` exposes a factory and holds no module
 * state, and why this module is the only caller of it.
 *
 * **The ordering contract still holds.** Importing `@chatic/web-config` runs its module-load steps
 * (deeplink overrides → storage choice → `logout=1`) before any `WEB_*` value is read here.
 *
 * **Construction is lazy, and the boot is no longer implicit.** web-config's module fired
 * `startWebTransportInit()` at import time; every app instead reaches the boot through
 * `initializeRelaySession()` (via `useRelaySessionInit`), which awaits it before gating its subtree,
 * and the boot is single-flighted, so the import-time head start was only ever a few milliseconds of
 * overlap with the call that already awaits it. Dropping it makes importing this module inert —
 * which is what keeps the SDK out of test runs and what 5단계's explicit `initAppRuntime(config)`
 * boot will formalize.
 */
let bundle: SealedWebTransportBundle | null = null;

const getBundle = (): SealedWebTransportBundle => {
    if (!bundle) {
        bundle = createLemonWebTransport({
            project: WEB_ENV === 'local' ? `${WEB_PROJECT}_${WEB_ENV}` : WEB_PROJECT,
            oAuthEndpoint: WEB_OAUTH_ENDPOINT,
            region: WEB_REGION,
            storage: usePersistentWebStorage ? localStorage : sessionStorage,
        });
    }
    return bundle;
};

/**
 * Forwards to the lazily built instance. Written out rather than proxied so the surface stays the
 * one `@chatic/http` sealed — `init`/`isAuthenticated`/`getTokenStorage` are absent here because
 * they are absent there (ADR-0070 결정 2 불변조건 3).
 */
export const webTransport: SealedWebTransport = {
    logout: () => getBundle().transport.logout(),
    setUseXLemonLanguage: (enabled, key) => getBundle().transport.setUseXLemonLanguage(enabled, key),
    buildRequest: config => getBundle().transport.buildRequest(config),
    buildSignedRequest: config => getBundle().transport.buildSignedRequest(config),
    buildCredentialsByToken: token => getBundle().transport.buildCredentialsByToken(token),
    getTokenSignature: () => getBundle().transport.getTokenSignature(),
};

/** `init()` minus lemon's own refresh, single-flighted. Awaited by `initializeRelaySession()`. */
export const startWebTransportInit = (): Promise<void> => getBundle().startInit();

/** Forces the next `startWebTransportInit()` to run again — used by logout. */
export const resetWebTransportInit = (): void => getBundle().resetInit();

/** Read-only session-EXISTENCE probe. Never refreshes. */
export const hasStoredRelaySession = (): Promise<boolean> => getBundle().hasStoredSession();

/** Read-only staleness probe. Never refreshes — the socket `AuthController` owns that. */
export const isStoredSessionExpired = (): Promise<boolean> => getBundle().isStoredSessionExpired();
