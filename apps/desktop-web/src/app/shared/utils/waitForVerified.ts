import { runtime } from '@chatic/runtime';

export const waitForVerified = (timeoutMs = 5000): Promise<boolean> =>
    runtime.connection.waitUntilVerified(null, timeoutMs);
