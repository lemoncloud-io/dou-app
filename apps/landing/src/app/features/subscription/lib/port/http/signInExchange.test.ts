import { DEVICE_ID_KEY, exchangeSignInCode, readDeviceId } from './signInExchange';

import type { KeyValueStore } from '@chatic/storage';

const memoryStore = (): KeyValueStore => {
    const values = new Map<string, string>();
    return {
        get: key => values.get(key) ?? null,
        set: (key, value) => void values.set(key, value),
        remove: key => void values.delete(key),
        clear: () => values.clear(),
        keys: () => [...values.keys()],
    };
};

describe('readDeviceId', () => {
    it('makes the id once and keeps it for every later sign-in from this browser', () => {
        const store = memoryStore();
        const make = vi.fn(() => 'device-1');
        expect(readDeviceId(store, make)).toBe('device-1');
        expect(readDeviceId(store, make)).toBe('device-1');
        expect(make).toHaveBeenCalledTimes(1);
        expect(store.get(DEVICE_ID_KEY)).toBe('device-1');
    });
});

describe('exchangeSignInCode', () => {
    const signInSession = () => {
        const calls: string[] = [];
        return {
            calls,
            session: {
                loginGuest: vi.fn(async (deviceId: string) => void calls.push(`guest:${deviceId}`)),
                exchangeLinked: vi.fn(
                    async (provider: string, code: string) => void calls.push(`link:${provider}:${code}`)
                ),
            },
        };
    };

    it('signs the device guest in first, then exchanges the code signed with it', async () => {
        const { session, calls } = signInSession();
        await exchangeSignInCode(session, () => 'device-1', 'google', 'code-123456');
        expect(calls).toEqual(['guest:device-1', 'link:google:code-123456']);
    });

    it('signs the guest in again on every sign-in, so no earlier session signs the exchange', async () => {
        const { session, calls } = signInSession();
        await exchangeSignInCode(session, () => 'device-1', 'google', 'code-111111');
        await exchangeSignInCode(session, () => 'device-1', 'apple', 'code-222222');
        expect(calls).toEqual([
            'guest:device-1',
            'link:google:code-111111',
            'guest:device-1',
            'link:apple:code-222222',
        ]);
    });

    it('does not exchange the code when the guest sign-in fails', async () => {
        const { session } = signInSession();
        session.loginGuest.mockRejectedValueOnce(new Error('relay down'));
        await expect(exchangeSignInCode(session, () => 'device-1', 'google', 'code-123456')).rejects.toThrow(
            'relay down'
        );
        expect(session.exchangeLinked).not.toHaveBeenCalled();
    });
});
