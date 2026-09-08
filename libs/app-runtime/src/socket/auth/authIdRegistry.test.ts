import { authIdRegistry } from './authIdRegistry';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const makeAuth = () => ({ register: jest.fn() });
const sign = jest.fn().mockResolvedValue({ signature: 'sig', current: 'now' });

describe('authIdRegistry', () => {
    beforeEach(() => {
        authIdRegistry.reset();
        jest.clearAllMocks();
    });

    it('records what was registered, per kind', () => {
        authIdRegistry.record('relay', 'relay-auth');
        authIdRegistry.record('cloud', 'cloud-auth');

        expect(authIdRegistry.get('relay')).toBe('relay-auth');
        expect(authIdRegistry.get('cloud')).toBe('cloud-auth');
    });

    it('reports null for a slot that never registered', () => {
        expect(authIdRegistry.get('relay')).toBeNull();
    });

    // The drift this whole file exists for: the store moved to a new $auth.id while the controller
    // still quotes the old one, so every later refresh 403s with `invalid sign`.
    it('re-seeds the controller when the store authId no longer matches the registered one', () => {
        authIdRegistry.record('relay', 'old-auth');
        const auth = makeAuth();

        const resynced = authIdRegistry.resync('relay', auth, { token: 'tok', authId: 'new-auth' }, sign);

        expect(resynced).toBe(true);
        expect(auth.register).toHaveBeenCalledWith({ token: 'tok', authId: 'new-auth', sign });
        // The mirror follows, so a second writeback with the same id is a no-op.
        expect(authIdRegistry.get('relay')).toBe('new-auth');
    });

    it('does nothing when the authId still matches', () => {
        authIdRegistry.record('relay', 'same-auth');
        const auth = makeAuth();

        const resynced = authIdRegistry.resync('relay', auth, { token: 'tok', authId: 'same-auth' }, sign);

        expect(resynced).toBe(false);
        expect(auth.register).not.toHaveBeenCalled();
    });

    // Never registered here (e.g. a slot bootstrapped before a hot reload): a drift we cannot
    // observe must not be guessed at, or every boot would fire a needless register.
    it('does nothing for an unrecorded slot', () => {
        const auth = makeAuth();

        const resynced = authIdRegistry.resync('relay', auth, { token: 'tok', authId: 'any-auth' }, sign);

        expect(resynced).toBe(false);
        expect(auth.register).not.toHaveBeenCalled();
    });

    // relay and cloud register independently (§6-6); one slot's rotation must not re-seed the other.
    it('keeps the two kinds independent', () => {
        authIdRegistry.record('relay', 'relay-auth');
        authIdRegistry.record('cloud', 'cloud-auth');
        const cloudAuth = makeAuth();

        const resynced = authIdRegistry.resync('cloud', cloudAuth, { token: 'tok', authId: 'cloud-auth' }, sign);

        expect(resynced).toBe(false);
        expect(authIdRegistry.get('relay')).toBe('relay-auth');
    });

    it('warns with both ids so the drift is measurable in production', () => {
        const { logger } = jest.requireMock('@chatic/bridges') as { logger: { warn: jest.Mock } };
        authIdRegistry.record('relay', 'old-auth');

        authIdRegistry.resync('relay', makeAuth(), { token: 'tok', authId: 'new-auth' }, sign);

        expect(logger.warn).toHaveBeenCalledWith(
            'SOCKET',
            '[authIdRegistry] registered authId drifted from the store — re-seeding',
            expect.objectContaining({ data: { kind: 'relay', registered: 'old-auth', current: 'new-auth' } })
        );
    });
});
