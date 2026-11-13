import { runtime } from '@chatic/app-runtime';

/**
 * Resolves once the socket reports `isVerified` (auth:update acknowledged), or
 * `false` on timeout. Used by the cloud/place switch flow to gate fetches until
 * the new cloud/place auth handshake completes.
 */
export const waitForVerified = (timeoutMs = 5000): Promise<boolean> =>
    runtime.connection.waitUntilVerified(null, timeoutMs);
