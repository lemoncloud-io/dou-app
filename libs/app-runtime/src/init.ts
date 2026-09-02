import { logger } from '@chatic/bridges';

import { configureCredentialRecovery } from './connection/configureCredentialRecovery';
import { configureDataRuntime } from './data/runtime';
import { configureSessionStore } from './session/store/configure';

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
 * `configureSessionStore()`, and loading `connection` ran `configureCredentialRecovery()`. That made
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

    // Env → relay endpoint resolvers. First, because everything below may end up reading the session.
    configureSessionStore();
    // Teaches the HTTP transport how to re-mint a lapsed signing credential, per route. Lives in
    // `connection/` because it is the one layer downstream of both http and socket.
    configureCredentialRecovery();

    if (config.data) {
        configureDataRuntime(config.data);
    }
};

/** Test seam — lets a case assert the duplicate-boot warning from a clean slate. */
export const resetAppRuntimeBootFlag = (): void => {
    booted = false;
};
