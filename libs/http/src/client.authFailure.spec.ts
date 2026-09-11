import { createHttpClient } from './client';

import type { LemonRequestBuilder, LemonRequestSurface } from './adapters/lemonWebCore';
import type { HttpRoute, HttpRuntimePorts } from './ports';

/**
 * The server's own "this session is over" verdict, reported to the app.
 *
 * `onAuthFailure` has been part of `HttpRuntimePorts` all along, but its only caller was
 * `withRetry` — which has no production callers left and is not exported — so the port never
 * fired. Every logout in the runtime therefore came from a GUESS (a guard that could not refresh)
 * rather than from a refusal. These cases pin the two halves of fixing that: what counts as a
 * refusal, and what must not.
 */
const execute = jest.fn();
const builder: LemonRequestBuilder = {
    setBody: jest.fn(() => builder),
    setParams: jest.fn(() => builder),
    execute,
};

const lemonSurface: jest.Mocked<LemonRequestSurface> = {
    buildRequest: jest.fn(() => builder),
    buildSignedRequest: jest.fn(() => builder),
};

/** No `isCredentialStale`, so nothing is marked stale and the recovery branch stays out of the way. */
const portsWith = (
    onAuthFailure: HttpRuntimePorts['onAuthFailure'],
    recoverCredential?: (route: HttpRoute) => Promise<boolean>
): HttpRuntimePorts => ({
    resolveEndpoint: () => 'https://api.test',
    onAuthFailure,
    recoverCredential,
});

const get = { method: 'GET' as const, baseURL: 'https://api.test/mocks/0/list' };

const withStatus = (status: number, message = 'refused') => Object.assign(new Error(message), { status });

beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});

describe('서버가 거절한 세션 — onAuthFailure 보고', () => {
    it('403은 보고한다 — 재발급으로 살릴 수 없는 거절이다', async () => {
        execute.mockRejectedValue(withStatus(403));
        const onAuthFailure = jest.fn();

        await expect(
            createHttpClient(lemonSurface, portsWith(onAuthFailure)).executeSignedRelayRequest(get)
        ).rejects.toThrow();

        expect(onAuthFailure).toHaveBeenCalledTimes(1);
        expect(onAuthFailure.mock.calls[0][1]).toContain('GET https://api.test/mocks/0/list');
    });

    it('INVALID_TOKEN도 보고한다 — status 없는 거절이다', async () => {
        execute.mockRejectedValue(new Error('INVALID_TOKEN'));
        const onAuthFailure = jest.fn();

        await expect(
            createHttpClient(lemonSurface, portsWith(onAuthFailure)).executeSignedRelayRequest(get)
        ).rejects.toThrow();

        expect(onAuthFailure).toHaveBeenCalledTimes(1);
    });

    it('500은 보고하지 않는다 — 서버 장애는 세션 이야기가 아니다', async () => {
        execute.mockRejectedValue(withStatus(500));
        const onAuthFailure = jest.fn();

        await expect(
            createHttpClient(lemonSurface, portsWith(onAuthFailure)).executeSignedRelayRequest(get)
        ).rejects.toThrow();

        expect(onAuthFailure).not.toHaveBeenCalled();
    });

    it('오프라인/네트워크 실패도 보고하지 않는다', async () => {
        execute.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
        const onAuthFailure = jest.fn();

        await expect(
            createHttpClient(lemonSurface, portsWith(onAuthFailure)).executeSignedRelayRequest(get)
        ).rejects.toThrow();

        expect(onAuthFailure).not.toHaveBeenCalled();
    });

    // 자격증명 만료는 애초에 `shouldLogout: false`로 분류된다 — 한 시간 열어둔 탭은 죽은 세션이
    // 아니다. 재발급에 실패해도 마찬가지다: 그건 소켓 이야기지 서버의 거절이 아니다.
    it('자격증명 만료는 재발급이 실패해도 보고하지 않는다', async () => {
        execute.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
        const onAuthFailure = jest.fn();
        const recover = jest.fn().mockResolvedValue(false);
        const ports: HttpRuntimePorts = {
            resolveEndpoint: () => 'https://api.test',
            isCredentialStale: () => true,
            recoverCredential: recover,
            onAuthFailure,
        };

        await expect(createHttpClient(lemonSurface, ports).executeSignedRelayRequest(get)).rejects.toThrow();

        expect(recover).toHaveBeenCalled();
        expect(onAuthFailure).not.toHaveBeenCalled();
    });

    // 재발급이 성공했으니 두 번째 시도의 자격증명은 더 이상 stale이 아니다 — 그래서 같은 403이
    // 이번에는 "만료된 서명"이 아니라 서버의 거절로 분류된다. 스토어가 stale이라고 말하는 동안에는
    // 403도 만료로 읽히므로(분류가 marker를 먼저 본다) 순서가 계약의 일부다.
    it('재발급 후 다시 보낸 요청이 403이면 그때 한 번 보고한다', async () => {
        execute
            .mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))
            .mockRejectedValueOnce(withStatus(403));
        const onAuthFailure = jest.fn();
        const ports: HttpRuntimePorts = {
            resolveEndpoint: () => 'https://api.test',
            isCredentialStale: jest.fn().mockReturnValueOnce(true).mockReturnValue(false),
            recoverCredential: jest.fn().mockResolvedValue(true),
            onAuthFailure,
        };

        await expect(createHttpClient(lemonSurface, ports).executeSignedRelayRequest(get)).rejects.toThrow();

        expect(execute).toHaveBeenCalledTimes(2);
        expect(onAuthFailure).toHaveBeenCalledTimes(1);
    });
});
