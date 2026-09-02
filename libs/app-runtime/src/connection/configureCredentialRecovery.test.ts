/**
 * One recovery for every route, because relay owns the only credential that signs. `oauth`/`iap`
 * hosts have none of their own, so they recover the same way.
 *
 * The cloud branch that used to live here is gone with the cloud route: nothing signs with the cloud
 * credential, so no failed request can blame it. Cloud re-issue is still real — it belongs to
 * `useCloudCredentialGuard`, which watches the cloud SOCKET, not to HTTP recovery.
 */
import { credentialRecovery } from '../http/credentialRecovery';
import { configureCredentialRecovery } from './configureCredentialRecovery';

const mockRequestSessionRefresh = jest.fn();

jest.mock('../socket/auth/requestRelaySessionRefresh', () => ({
    requestRelaySessionRefresh: (...a: unknown[]) => mockRequestSessionRefresh(...a),
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockRequestSessionRefresh.mockResolvedValue(true);
    configureCredentialRecovery();
});

afterEach(() => {
    credentialRecovery.register(null);
});

describe('configureCredentialRecovery', () => {
    // 자기 자격증명이 없는 호스트들도 relay 것으로 서명하므로 복구 경로가 같다.
    it.each(['relay', 'oauth', 'iap'] as const)('%s는 소켓 refresh로 간다', async route => {
        await expect(credentialRecovery.recover(route)).resolves.toBe(true);

        expect(mockRequestSessionRefresh).toHaveBeenCalledWith();
    });

    it('복구가 실패하면 false를 그대로 전달한다', async () => {
        mockRequestSessionRefresh.mockResolvedValue(false);

        await expect(credentialRecovery.recover('relay')).resolves.toBe(false);
    });
});
