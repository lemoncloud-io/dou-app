import { sealLemonTransport } from './lemonTransport';

import type { LemonWebTransport } from './lemonTransport';

const createFake = () => {
    const initLemonConfig = jest.fn().mockResolvedValue(undefined);
    const hasCachedToken = jest.fn().mockResolvedValue(true);
    const shouldRefreshToken = jest.fn().mockResolvedValue(false);
    const buildCredentialsByStorage = jest.fn().mockResolvedValue(undefined);
    // Present on the real SDK object but absent from `SealedWebTransport` — spied so the tests can
    // assert the boot never reaches for them (ADR-0070 결정 2 불변조건 3).
    const init = jest.fn();
    const isAuthenticated = jest.fn();

    const transport = {
        init,
        isAuthenticated,
        buildCredentialsByStorage,
        getTokenStorage: () => ({ initLemonConfig, hasCachedToken, shouldRefreshToken }),
    } as unknown as LemonWebTransport;

    return {
        transport,
        initLemonConfig,
        hasCachedToken,
        shouldRefreshToken,
        buildCredentialsByStorage,
        init,
        isAuthenticated,
    };
};

describe('sealLemonTransport', () => {
    it('seeds the lemon config keys and rebuilds credentials from storage', async () => {
        const fake = createFake();
        const bundle = sealLemonTransport(fake.transport);

        await bundle.startInit();

        expect(fake.initLemonConfig).toHaveBeenCalledTimes(1);
        expect(fake.buildCredentialsByStorage).toHaveBeenCalledTimes(1);
    });

    it('never calls lemon own init()/isAuthenticated() — the APIs that fire its HTTP refresh', async () => {
        const fake = createFake();
        const bundle = sealLemonTransport(fake.transport);

        await bundle.startInit();
        await bundle.hasStoredSession();
        await bundle.isStoredSessionExpired();

        expect(fake.init).not.toHaveBeenCalled();
        expect(fake.isAuthenticated).not.toHaveBeenCalled();
    });

    it('skips the credential rebuild when nothing is stored', async () => {
        const fake = createFake();
        fake.hasCachedToken.mockResolvedValue(false);
        const bundle = sealLemonTransport(fake.transport);

        await bundle.startInit();

        expect(fake.initLemonConfig).toHaveBeenCalledTimes(1);
        expect(fake.buildCredentialsByStorage).not.toHaveBeenCalled();
    });

    it('boots anyway when the stored bundle is partial — a corrupt store is not a boot failure', async () => {
        const fake = createFake();
        fake.buildCredentialsByStorage.mockRejectedValue(new Error('missing AccessKeyId'));
        const bundle = sealLemonTransport(fake.transport);

        await expect(bundle.startInit()).resolves.toBeUndefined();
    });

    it('single-flights concurrent boots and no-ops once done', async () => {
        const fake = createFake();
        const bundle = sealLemonTransport(fake.transport);

        await Promise.all([bundle.startInit(), bundle.startInit()]);
        await bundle.startInit();

        expect(fake.initLemonConfig).toHaveBeenCalledTimes(1);
    });

    it('a failed boot is retried rather than latched as done', async () => {
        const fake = createFake();
        fake.initLemonConfig.mockRejectedValueOnce(new Error('boom'));
        const bundle = sealLemonTransport(fake.transport);

        await expect(bundle.startInit()).rejects.toThrow('boom');
        await bundle.startInit();

        expect(fake.initLemonConfig).toHaveBeenCalledTimes(2);
    });

    it('resetInit forces the next boot to run again', async () => {
        const fake = createFake();
        const bundle = sealLemonTransport(fake.transport);

        await bundle.startInit();
        bundle.resetInit();
        await bundle.startInit();

        expect(fake.initLemonConfig).toHaveBeenCalledTimes(2);
    });

    it('the session probes are read-only storage reads', async () => {
        const fake = createFake();
        fake.hasCachedToken.mockResolvedValue(true);
        fake.shouldRefreshToken.mockResolvedValue(true);
        const bundle = sealLemonTransport(fake.transport);

        await expect(bundle.hasStoredSession()).resolves.toBe(true);
        await expect(bundle.isStoredSessionExpired()).resolves.toBe(true);
        expect(fake.buildCredentialsByStorage).not.toHaveBeenCalled();
    });
});
