import { logger } from '@chatic/logger';
import type { RuntimeEngine } from '@chatic/runtime-core';

const callbacks = new Set<() => void>();
let engine: RuntimeEngine | null = null;
let detach: (() => void) | null = null;

const runCallbacks = (): void => {
    for (const callback of [...callbacks]) {
        try {
            callback();
        } catch (error) {
            logger.error('AUTH', 'A sign-out callback threw', { error });
        }
    }
};

const attach = (): void => {
    if (detach || !engine || callbacks.size === 0) return;
    detach = engine.session.onLogout(runCallbacks);
};

export const registerSessionLogoutCallback = (callback: () => void): (() => void) => {
    callbacks.add(callback);
    attach();
    return () => {
        callbacks.delete(callback);
    };
};

export const attachLogoutCallbacks = (next: RuntimeEngine): void => {
    detach?.();
    detach = null;
    engine = next;
    attach();
};
