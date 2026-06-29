import { getSocketManager } from '@chatic/app-runtime';

/**
 * Resolves once the socket reports `isVerified` (auth:update acknowledged), or
 * `false` on timeout. Used by the cloud/place switch flow to gate fetches until
 * the new cloud/place auth handshake completes.
 */
export const waitForVerified = (timeoutMs = 5000): Promise<boolean> =>
    new Promise(resolve => {
        const manager = getSocketManager();
        if (manager.getSnapshot().isVerified) {
            resolve(true);
            return;
        }

        const timer = setTimeout(() => {
            unsub();
            resolve(false);
        }, timeoutMs);

        const unsub = manager.subscribe(state => {
            if (state.isVerified) {
                clearTimeout(timer);
                unsub();
                resolve(true);
            }
        });
    });
