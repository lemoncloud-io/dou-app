import { setStorageAdapter } from '@chatic/shared';

import { cloudStore, relayStore } from '../store/stores';
import { pairedClouds } from './pairedClouds';
import { isInOwnCloudSession, isPairedSession } from './pairedSession';

const store = new Map<string, string>();
setStorageAdapter({
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: key => void store.delete(key),
});

const tokenWith = (auth: Record<string, unknown>, userRole = 'guest') =>
    jest.spyOn(relayStore, 'getRelayToken').mockReturnValue({ userRole, $auth: auth } as never);

beforeEach(() => {
    store.clear();
    jest.restoreAllMocks();
});

describe('isPairedSession', () => {
    it('is true for a relay session issued by a pairing', () => {
        tokenWith({ id: 'a-1', purpose: 'web', pairingId: 'p-1' });
        expect(isPairedSession()).toBe(true);
    });

    it('is false for a session from any other login', () => {
        tokenWith({ id: 'a-1' });
        expect(isPairedSession()).toBe(false);
    });

    it('is true for a guest that entered a cloud through a pairing', () => {
        tokenWith({ id: 'guest' });
        pairedClouds.add('1000002');
        expect(isPairedSession()).toBe(true);
    });

    it('is false for an account that still holds a guest-era paired cloud', () => {
        tokenWith({ id: 'a-1' }, 'user');
        pairedClouds.add('1000002');
        expect(isPairedSession()).toBe(false);
    });

    it('is false with no session at all', () => {
        jest.spyOn(relayStore, 'getRelayToken').mockReturnValue(null);
        expect(isPairedSession()).toBe(false);
    });
});

describe('isInOwnCloudSession', () => {
    const committed = (cloudId: string | null) =>
        jest.spyOn(cloudStore, 'getDelegationToken').mockReturnValue(cloudId ? ({ cloudId } as never) : null);

    it('is true inside a cloud the guest entered on its own invite', () => {
        committed('1000004');
        expect(isInOwnCloudSession()).toBe(true);
    });

    it('is false on DoU Home, with no cloud committed or the relay', () => {
        committed(null);
        expect(isInOwnCloudSession()).toBe(false);
        committed('default');
        expect(isInOwnCloudSession()).toBe(false);
    });

    it('is false inside a cloud this device entered through a pairing', () => {
        pairedClouds.add('1000004');
        committed('1000004');
        expect(isInOwnCloudSession()).toBe(false);
    });
});
