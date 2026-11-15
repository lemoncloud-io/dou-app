import { logger } from '@chatic/logger';
import type { RuntimeEngine } from '@chatic/runtime-core';

const callbacks = new Set<() => void>();
let engine: RuntimeEngine | null = null;
let detach: (() => void) | null = null;

// Each on its own: one that throws must not keep the others from dropping what they keep.
const runCallbacks = (): void => {
    for (const callback of [...callbacks]) {
        try {
            callback();
        } catch (error) {
            logger.error('AUTH', 'A sign-out callback threw', { error });
        }
    }
};

/** Starts listening to the engine's sign-outs once there is a callback to run; it then keeps listening. */
const attach = (): void => {
    if (detach || !engine || callbacks.size === 0) return;
    detach = engine.session.onLogout(runCallbacks);
};

/**
 * Runs `callback` on each sign-out, for what the page keeps for the signed-in person and drops with
 * them. Heard through the engine (`session.onLogout`), so it fires whichever process ran the sign-out.
 * It may be registered before the engine is handed over — the log uploader starts first — and is
 * attached when it is.
 */
export const registerSessionLogoutCallback = (callback: () => void): (() => void) => {
    callbacks.add(callback);
    attach();
    return () => {
        callbacks.delete(callback);
    };
};

/** Hands the callbacks to an engine's sign-outs, leaving any engine before it. `initAppRuntime` calls it. */
export const attachLogoutCallbacks = (next: RuntimeEngine): void => {
    detach?.();
    detach = null;
    engine = next;
    attach();
};
