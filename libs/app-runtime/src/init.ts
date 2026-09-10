import { logger } from '@chatic/bridges';

import { attachConfigStateLog } from './config/configStateLog';
import { configureDataRuntime } from './data/runtime';
import { credentialRecovery } from './http/credentialRecovery';
import { logoutStorageSweeper } from './session/auth/logoutStorageSweep';
import { configureSessionStore } from './session/store/configure';
import { credentialRenewers } from './socket/auth/renewers';

import type { HttpRoute } from '@chatic/http';
import type { DataRuntimeConfig } from './data/runtime';

export interface AppRuntimeConfig {
    /**
     * Repository and cache-assembly policies, applied before the data runtime is lazily built on
     * first repository access — e.g. apps/web's relay-only embedded-`$site` persistence (ADR-0045),
     * desktop-web's per-channel chat cap.
     */
    data?: DataRuntimeConfig;
}

let booted = false;

/**
 * Boots the runtime. **Every app calls this once from its entry point, before render.**
 *
 * ## Why this exists
 *
 * The wiring below used to run as an **import side effect**: loading the `session` barrel ran
 * `configureSessionStore()`, and loading `connection` registered the credential recovery. That made
 * boot a consequence of which module someone happened to import first — invisible in the entry
 * point, impossible to order against the app's own setup, and silently skippable by a tree-shake or
 * an import reshuffle. ADR-0070 5단계 named the replacement and left it as follow-up work; this is it.
 *
 * ## The ordering contract
 *
 * Two boundaries, and the call belongs between them:
 *
 * - **After the app's logging/bridge wiring.** The log hub's listeners must exist before anything
 *   logs, and this call can log (the duplicate-boot warning below, and `configureDataRuntime`'s
 *   late-registration warning). apps/web states the same rule for its own collectors.
 * - **Before anything that can read the session.** `relayStore` throws rather than guessing when its
 *   endpoint resolvers are missing, so a read before this call is a loud failure, not a silent empty
 *   host. That is deliberate: the failure names this function.
 *
 * Nothing here touches the network. Endpoint resolution is injected as *functions*, so a deeplink
 * override captured after boot still applies, and the transport is built lazily on first use.
 *
 * ## Idempotency
 *
 * Safe to call twice (HMR, a remount) — the wiring is assignment, not accumulation. A second call is
 * still reported: a duplicate boot means two entry paths believe they own it, which is how the
 * pre-ADR-0070 tree ended up initializing the transport twice.
 */
export const initAppRuntime = (config: AppRuntimeConfig = {}): void => {
    if (booted) {
        logger.warn('WEB_CORE', '[initAppRuntime] called more than once; the runtime is already booted');
    }
    booted = true;

    // Honors `?logout=1` — the flag `RelaySession.logout()` leaves on the URL it redirects to.
    // FIRST, because everything below may end up reading a token, and this is what drops the ones
    // belonging to the account that just signed out.
    logoutStorageSweeper.sweep();

    // Env → relay endpoint resolvers. Next, because everything below may end up reading the session.
    configureSessionStore();
    // Teaches the HTTP transport how to re-mint a lapsed signing credential.
    //
    // **Every route recovers the same way, because relay is the only credential that signs.** A relay
    // token has no parent to mint a new one from, so its only recovery is `auth.refresh` through the
    // socket that owns it (ADR-0070 불변조건 1); `oauth`/`iap` sign with that same credential — their
    // hosts have none of their own — so they take the same path (ADR-0076 결정 3). The `cloud` branch
    // that used to be here is gone with the route: nothing signs with the cloud credential any more,
    // so no failed request can blame it. Cloud re-issue is still real — it belongs to the guard that
    // watches the cloud SOCKET (`useCloudCredentialGuard` → `renewCloudSession`), not to HTTP.
    //
    // **Wired here rather than in a module of its own.** The two wirings above and below delegate to
    // the module that OWNS the thing being configured (the store, the data runtime). This one owns
    // nothing: it joins the HTTP registry to the socket renewers, and the registry deliberately
    // imports nothing at runtime so the two sides never meet (see `http/credentialRecovery.ts`). A
    // wiring with no owner belongs to the composition root, which is this function — it used to sit
    // in `connection/` only because that folder happened to be downstream of both.
    credentialRecovery.register((_route: HttpRoute) => credentialRenewers.relay.renew());

    if (config.data) {
        configureDataRuntime(config.data);
    }

    // Records this device's effective settings in the logs (ADR-0079 결정 16). Last, because the
    // boot line should describe the registry as the app will actually run with it, and unconditional
    // because every app that boots the runtime also boots the config registry. With the registry
    // unwired it degrades to a single "nothing is overridden" line rather than failing — the
    // resolver simply has nothing to report yet.
    attachConfigStateLog();
};
