import { credentialRecovery } from './credentialRecovery';

/**
 * The late-bound hook the transport calls after a stale-credential failure. Unregistered must be a
 * SAFE state, not a broken one — a test or an app that never mounts the runtime host simply loses
 * the retry.
 */
afterEach(() => {
    credentialRecovery.register(null);
});

describe('credentialRecovery', () => {
    it('등록 전에는 false — 복구 배선이 없다고 요청이 실패하면 안 된다', async () => {
        await expect(credentialRecovery.recover('relay')).resolves.toBe(false);
    });

    it('등록된 구현에 route를 그대로 넘긴다', async () => {
        const fn = jest.fn().mockResolvedValue(true);
        credentialRecovery.register(fn);

        await expect(credentialRecovery.recover('cloud')).resolves.toBe(true);
        expect(fn).toHaveBeenCalledWith('cloud');
    });

    it('구현이 throw하면 false — 복구 실패가 새 에러로 둔갑하지 않는다', async () => {
        credentialRecovery.register(() => Promise.reject(new Error('refresh exploded')));

        await expect(credentialRecovery.recover('relay')).resolves.toBe(false);
    });

    it('null로 되돌리면 다시 false', async () => {
        credentialRecovery.register(jest.fn().mockResolvedValue(true));
        credentialRecovery.register(null);

        await expect(credentialRecovery.recover('relay')).resolves.toBe(false);
    });
});
