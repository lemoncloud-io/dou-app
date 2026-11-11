import { sessionStores } from '@chatic/session/store/ports';

import { cloudStore, relayStore } from '@chatic/session/store/stores';
import { pairedClouds } from './pairedClouds';
import { isInOwnCloudSession, isPairedSession } from './pairedSession';

const map = new Map<string, string>();
// One map behind both session ports — these tests are about the list, not which port holds it.
const store = {
    get: (key: string) => map.get(key) ?? null,
    set: (key: string, value: string) => void map.set(key, value),
    remove: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    keys: () => [...map.keys()],
};
sessionStores.configure({ secret: store, plain: store });

const tokenWith = (auth: Record<string, unknown>, userRole = 'guest') =>
    jest.spyOn(relayStore, 'getRelayToken').mockReturnValue({ userRole, $auth: auth } as never);

beforeEach(() => {
    map.clear();
    jest.restoreAllMocks();
});

describe('isPairedSession', () => {
    it('is true for a relay session issued by a pairing', () => {
        tokenWith({ id: 'a-1', purpose: 'web', pairingId: 'p-1' });
        expect(isPairedSession()).toBe(true);
    });

    it('is false for a token with no auth record, or one that is not an object', () => {
        jest.spyOn(relayStore, 'getRelayToken').mockReturnValue({ userRole: 'user' } as never);
        expect(isPairedSession()).toBe(false);
        jest.spyOn(relayStore, 'getRelayToken').mockReturnValue({ userRole: 'user', $auth: 'web' } as never);
        expect(isPairedSession()).toBe(false);
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
