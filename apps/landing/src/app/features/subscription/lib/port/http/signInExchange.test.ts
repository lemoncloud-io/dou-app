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
    const sessionWith = (authenticated: boolean) => {
        const calls: string[] = [];
        return {
            calls,
            session: {
                isAuthenticated: () => authenticated,
                loginGuest: vi.fn(async (deviceId: string) => void calls.push(`guest:${deviceId}`)),
                exchangeLinked: vi.fn(
                    async (provider: string, code: string) => void calls.push(`link:${provider}:${code}`)
                ),
            },
        };
    };

    it('signs the device guest in first, then exchanges the code signed with it', async () => {
        const { session, calls } = sessionWith(false);
        await exchangeSignInCode(session, () => 'device-1', 'google', 'code-123456');
        expect(calls).toEqual(['guest:device-1', 'link:google:code-123456']);
    });

    it('exchanges with the session already on the tab, without another guest sign-in', async () => {
        const { session, calls } = sessionWith(true);
        const deviceId = vi.fn(() => 'device-1');
        await exchangeSignInCode(session, deviceId, 'apple', 'code-654321');
        expect(calls).toEqual(['link:apple:code-654321']);
        expect(deviceId).not.toHaveBeenCalled();
    });

    it('does not exchange the code when the guest sign-in fails', async () => {
        const { session } = sessionWith(false);
        session.loginGuest.mockRejectedValueOnce(new Error('relay down'));
        await expect(exchangeSignInCode(session, () => 'device-1', 'google', 'code-123456')).rejects.toThrow(
            'relay down'
        );
        expect(session.exchangeLinked).not.toHaveBeenCalled();
    });
});
