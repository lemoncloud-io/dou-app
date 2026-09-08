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
 * 두 describe의 **순서가 계약이다** — 부팅 전 상태를 먼저 재고 나서 부팅한다. jest는 한 파일 안의
 * describe/it을 선언 순서대로 돌리고 아래 `beforeAll`은 그 describe 진입 시점에 실행되므로, 첫
 * 블록은 아직 등록되지 않은 레지스트리를 본다. 부팅은 모듈 상태를 바꾸는 일회성 동작이라 되돌릴
 * 수 없고, 그래서 "부팅이 배선의 원천"이라는 주장을 이 파일에서 한 번만 관측할 수 있다.
 */
describe('부팅 전', () => {
    it('복구는 false다 — 미등록이 깨진 상태가 아니라 안전한 상태다', async () => {
        await expect(credentialRecovery.recover('relay')).resolves.toBe(false);

        // 레지스트리가 비어 있으면 renewer까지 가지 않는다. 전송은 이전과 똑같이 실패를 보고하고,
        // 잃는 것은 재시도 한 번뿐이다.
        expect(mockRequestSessionRefresh).not.toHaveBeenCalled();
    });
});

describe('initAppRuntime 이후 — 자격증명 복구 배선', () => {
    beforeAll(() => {
        initAppRuntime();
    });

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
