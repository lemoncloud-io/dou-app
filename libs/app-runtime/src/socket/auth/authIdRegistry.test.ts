import { authIdRegistry } from './authIdRegistry';
import { RELAY_SLOT, slotKeyOf } from '../utils/slotKey';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const makeAuth = () => ({ register: jest.fn() });
const sign = jest.fn().mockResolvedValue({ signature: 'sig', current: 'now' });

const RELAY = RELAY_SLOT;
const CLOUD = slotKeyOf('cloud-1');

describe('authIdRegistry', () => {
    beforeEach(() => {
        authIdRegistry.reset();
        jest.clearAllMocks();
    });

    it('records what was registered, per slot', () => {
        authIdRegistry.record(RELAY, 'relay-auth');
        authIdRegistry.record(CLOUD, 'cloud-auth');

        expect(authIdRegistry.get(RELAY)).toBe('relay-auth');
        expect(authIdRegistry.get(CLOUD)).toBe('cloud-auth');
    });

    it('reports null for a slot that never registered', () => {
        expect(authIdRegistry.get(RELAY)).toBeNull();
    });

    // The drift this whole file exists for: the store moved to a new $auth.id while the controller
    // still quotes the old one, so every later refresh 403s with `invalid sign`.
    it('re-seeds the controller when the store authId no longer matches the registered one', () => {
        authIdRegistry.record(RELAY, 'old-auth');
        const auth = makeAuth();

        const resynced = authIdRegistry.resync(RELAY, auth, { token: 'tok', authId: 'new-auth' }, sign);

        expect(resynced).toBe(true);
        expect(auth.register).toHaveBeenCalledWith({ token: 'tok', authId: 'new-auth', sign });
        // The mirror follows, so a second writeback with the same id is a no-op.
        expect(authIdRegistry.get(RELAY)).toBe('new-auth');
    });

    it('does nothing when the authId still matches', () => {
        authIdRegistry.record(RELAY, 'same-auth');
        const auth = makeAuth();

        const resynced = authIdRegistry.resync(RELAY, auth, { token: 'tok', authId: 'same-auth' }, sign);

        expect(resynced).toBe(false);
        expect(auth.register).not.toHaveBeenCalled();
    });

    // Never registered here (e.g. a slot bootstrapped before a hot reload): a drift we cannot
    // observe must not be guessed at, or every boot would fire a needless register.
    it('does nothing for an unrecorded slot', () => {
        const auth = makeAuth();

        const resynced = authIdRegistry.resync(RELAY, auth, { token: 'tok', authId: 'any-auth' }, sign);

        expect(resynced).toBe(false);
        expect(auth.register).not.toHaveBeenCalled();
    });

    // relay and each cloud register independently; one slot's rotation must not re-seed the other.
    it('keeps slots independent', () => {
        authIdRegistry.record(RELAY, 'relay-auth');
        authIdRegistry.record(CLOUD, 'cloud-auth');
        const cloudAuth = makeAuth();

        const resynced = authIdRegistry.resync(CLOUD, cloudAuth, { token: 'tok', authId: 'cloud-auth' }, sign);

        expect(resynced).toBe(false);
        expect(authIdRegistry.get(RELAY)).toBe('relay-auth');
    });

    it('warns with both ids so the drift is measurable in production', () => {
        const { logger } = jest.requireMock('@chatic/bridges') as { logger: { warn: jest.Mock } };
        authIdRegistry.record(RELAY, 'old-auth');

        authIdRegistry.resync(RELAY, makeAuth(), { token: 'tok', authId: 'new-auth' }, sign);

        expect(logger.warn).toHaveBeenCalledWith(
            'SOCKET',
            '[authIdRegistry] registered authId drifted from the store — re-seeding',
            expect.objectContaining({
                data: { kind: 'relay', cid: RELAY, registered: 'old-auth', current: 'new-auth' },
            })
        );
    });
});
