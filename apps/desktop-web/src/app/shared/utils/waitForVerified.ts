import { useWebSocketV2Store } from '@chatic/socket';

/**
 * Resolves once the socket reports `isVerified` (auth:update acknowledged), or
 * `false` on timeout. Used by the cloud/place switch flow to gate fetches until
 * the new cloud/place auth handshake completes.
 */
export const waitForVerified = (timeoutMs = 5000): Promise<boolean> =>
    new Promise(resolve => {
        if (useWebSocketV2Store.getState().isVerified) {
            resolve(true);
            return;
        }

        const timer = setTimeout(() => {
            unsub();
            resolve(false);
        }, timeoutMs);

        const unsub = useWebSocketV2Store.subscribe(
            s => s.isVerified,
            verified => {
                if (verified) {
                    clearTimeout(timer);
                    unsub();
                    resolve(true);
                }
            }
        );
    });
