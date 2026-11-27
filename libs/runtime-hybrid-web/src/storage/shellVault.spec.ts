import { MemoryStore, NativeSecureStore } from '@chatic/storage';
import type { IWebBridgeClient } from '@chatic/bridges';

import { createShellVault } from './shellVault';

describe('createShellVault', () => {
    it('falls back to the store it is handed when the shell cannot keep the session', async () => {
        const request = jest.fn().mockRejectedValue(new Error('no vault'));
        const fallback = new MemoryStore();
        fallback.set('k', 'from-fallback');

        const vault = createShellVault({ client: { request } as unknown as IWebBridgeClient, fallback });

        expect(vault).toBeInstanceOf(NativeSecureStore);
        await vault.hydrate();
        expect(request).toHaveBeenCalled();
        expect(vault.status).toBe('unavailable');
        expect(vault.get('k')).toBe('from-fallback');
    });
});
