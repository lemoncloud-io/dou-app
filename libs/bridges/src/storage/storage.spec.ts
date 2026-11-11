import { BridgeStorageChannel } from './bridgeStorageChannel';
import { shellKeepsStorageMedium } from './shellStorageMedia.util';

import type { IWebBridgeClient } from '../web';

const clientAnswering = (answer: (type: string) => Promise<unknown>) =>
    ({ request: jest.fn(({ type }: { type: string }) => answer(type)) }) as unknown as IWebBridgeClient & {
        request: jest.Mock;
    };

describe('BridgeStorageChannel', () => {
    it('reads the medium through StorageGet', async () => {
        const values = { status: 'available', values: { k: 'v' } };
        const client = clientAnswering(async () => ({ data: values }));

        await expect(new BridgeStorageChannel(client, 'nativeSecure').read()).resolves.toEqual(values);
        expect(client.request).toHaveBeenCalledWith(
            { type: 'StorageGet', data: { medium: 'nativeSecure' } },
            { timeoutMs: 5_000 }
        );
    });

    it('confirms a save or a clear only when the shell answered ok', async () => {
        const ok = new BridgeStorageChannel(
            clientAnswering(async () => ({ data: { ok: true } })),
            'nativeSecure'
        );
        const refused = new BridgeStorageChannel(
            clientAnswering(async () => ({ data: { ok: false } })),
            'nativeSecure'
        );

        await expect(ok.save({ a: '1' }, ['b'])).resolves.toBe(true);
        await expect(ok.clear()).resolves.toBe(true);
        await expect(refused.save({}, [])).resolves.toBe(false);
        await expect(refused.clear()).resolves.toBe(false);
    });

    it('reads a rejected request as not confirmed', async () => {
        const failing = new BridgeStorageChannel(
            clientAnswering(() => Promise.reject(new Error('NOT_FOUND'))),
            'nativeSecure'
        );

        await expect(failing.save({ a: '1' }, [])).resolves.toBe(false);
        await expect(failing.clear()).resolves.toBe(false);
        await expect(failing.read()).rejects.toThrow('NOT_FOUND');
    });
});

describe('shellKeepsStorageMedium', () => {
    afterEach(() => {
        delete window.CHATIC_APP_STORAGE_MEDIA;
    });

    it('answers from the injected list only', () => {
        expect(shellKeepsStorageMedium('nativeSecure')).toBe(false);
        window.CHATIC_APP_STORAGE_MEDIA = ['nativeSecure'];
        expect(shellKeepsStorageMedium('nativeSecure')).toBe(true);
        window.CHATIC_APP_STORAGE_MEDIA = 'nativeSecure';
        expect(shellKeepsStorageMedium('nativeSecure')).toBe(false);
    });
});
