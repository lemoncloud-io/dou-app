/**
 * One recovery for every route, because relay owns the only credential that signs. `oauth`/`iap`
 * hosts have none of their own, so they recover the same way.
 *
 * The cloud branch that used to live here is gone with the cloud route: nothing signs with the cloud
 * credential, so no failed request can blame it. Cloud re-issue is still real — it belongs to
 * `useCloudCredentialGuard`, which watches the cloud SOCKET, not to HTTP recovery.
 *
 * Driven through `initAppRuntime()` rather than a `configureCredentialRecovery()` of its own: the
 * wiring has no owning module (it joins the HTTP registry to the socket renewers), so it lives in the
 * composition root and the boot call is the only way to install it. That is also the contract worth
 * testing — a registry left unregistered is the SAFE state, so the thing that can silently break is
 * "boot did not wire it", not the wiring itself.
 */
import { credentialRecovery } from './http/credentialRecovery';
import { initAppRuntime } from './init';

const mockRequestSessionRefresh = jest.fn();

jest.mock('./socket/auth/requestRelaySessionRefresh', () => ({
    requestRelaySessionRefresh: (...a: unknown[]) => mockRequestSessionRefresh(...a),
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockRequestSessionRefresh.mockResolvedValue(true);
});

/**
 * **The order of the two describes is the contract** — measure the pre-boot state first, then boot.
 * Jest runs describe/it within one file in declaration order, and the `beforeAll` below runs when
 * that describe block is entered, so the first block sees a registry that hasn't been registered
 * yet. Booting is a one-time action that mutates module state and can't be undone, so the claim
 * "booting is the source of the wiring" can only be observed once in this file.
 */
describe('부팅 전', () => {
    it('복구는 false다 — 미등록이 깨진 상태가 아니라 안전한 상태다', async () => {
        await expect(credentialRecovery.recover('relay')).resolves.toBe(false);

        // If the registry is empty, it never reaches the renewer. The transport reports failure just
        // like before, and all that's lost is a single retry.
        expect(mockRequestSessionRefresh).not.toHaveBeenCalled();
    });
});

describe('initAppRuntime 이후 — 자격증명 복구 배선', () => {
    beforeAll(() => {
        initAppRuntime();
    });

    // Hosts with no credential of their own also sign with relay's, so the recovery path is the same.
    it.each(['relay', 'oauth', 'iap'] as const)('%s는 소켓 refresh로 간다', async route => {
        await expect(credentialRecovery.recover(route)).resolves.toBe(true);

        expect(mockRequestSessionRefresh).toHaveBeenCalledWith();
    });

    it('복구가 실패하면 false를 그대로 전달한다', async () => {
        mockRequestSessionRefresh.mockResolvedValue(false);

        await expect(credentialRecovery.recover('relay')).resolves.toBe(false);
    });
});
