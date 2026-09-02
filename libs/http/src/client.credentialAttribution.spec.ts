import { createHttpClient } from './client';
import { ErrorType, classifyError } from './error/classify';
import { staleCredentialMarker } from './error/credentialStale';

import type { LemonRequestBuilder, LemonRequestSurface } from './adapters/lemonWebCore';
import type { HttpRoute, HttpRuntimePorts } from './ports';

/**
 * Failure ATTRIBUTION: a signed request that dies with no status, while this route's credential was
 * already past its expiry, is a signature rejection — not the network outage every status-based rule
 * would read it as (the API Gateway 403 carrying it has no CORS header, so the browser withholds the
 * response). What this file pins is which failures earn that verdict and which must not.
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

/** Axios' shape for "the request never came back with a response". */
const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

const portsWith = (isCredentialStale?: (route: HttpRoute) => boolean): HttpRuntimePorts => ({
    resolveEndpoint: () => 'https://api.test',
    isCredentialStale,
});

const setOnline = (online: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
};

beforeEach(() => {
    jest.clearAllMocks();
    setOnline(true);
});

afterEach(() => {
    setOnline(true);
});

describe('signed request failure — credential attribution', () => {
    it('relay 서명 요청이 만료된 자격증명으로 실패하면 relay로 표시한다', async () => {
        execute.mockRejectedValue(networkError());
        const client = createHttpClient(
            lemonSurface,
            portsWith(() => true)
        );

        const error = await client
            .executeSignedRelayRequest({ method: 'POST', baseURL: 'https://api.test/x' })
            .catch(e => e);

        expect(staleCredentialMarker.routeOf(error)).toBe('relay');
    });

    it('UNSIGNED relay 요청은 표시하지 않는다 — 서명하지 않았으므로 자격증명 탓일 수 없다', async () => {
        execute.mockRejectedValue(networkError());
        const client = createHttpClient(
            lemonSurface,
            portsWith(() => true)
        );

        const error = await client.executeRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' }).catch(e => e);

        expect(staleCredentialMarker.isMarked(error)).toBe(false);
    });

    it('자격증명이 아직 살아 있으면 표시하지 않는다', async () => {
        execute.mockRejectedValue(networkError());
        const client = createHttpClient(
            lemonSurface,
            portsWith(() => false)
        );

        const error = await client
            .executeSignedRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' })
            .catch(e => e);

        expect(staleCredentialMarker.isMarked(error)).toBe(false);
    });

    it('오프라인이면 표시하지 않는다 — 만료 여부와 무관하게 모든 요청이 같은 모습으로 죽는다', async () => {
        setOnline(false);
        execute.mockRejectedValue(networkError());
        const client = createHttpClient(
            lemonSurface,
            portsWith(() => true)
        );

        const error = await client
            .executeSignedRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' })
            .catch(e => e);

        expect(staleCredentialMarker.isMarked(error)).toBe(false);
    });

    it('포트를 주지 않은 클라이언트는 예전과 동일하게 동작한다', async () => {
        execute.mockRejectedValue(networkError());
        const client = createHttpClient(lemonSurface, portsWith(undefined));

        const error = await client
            .executeSignedRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' })
            .catch(e => e);

        expect(staleCredentialMarker.isMarked(error)).toBe(false);
        expect(error.message).toBe('Network Error');
    });

    it('원래 에러를 그대로 던진다 — 표시는 덧붙일 뿐 대체하지 않는다', async () => {
        const original = networkError();
        execute.mockRejectedValue(original);
        const client = createHttpClient(
            lemonSurface,
            portsWith(() => true)
        );

        const error = await client
            .executeSignedRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' })
            .catch(e => e);

        expect(error).toBe(original);
        expect(error.code).toBe('ERR_NETWORK');
    });

    it('표시된 에러는 network가 아니라 AUTHENTICATION으로 분류된다 — 리포트 카테고리가 뒤집히는 지점', async () => {
        execute.mockRejectedValue(networkError());
        const client = createHttpClient(
            lemonSurface,
            portsWith(() => true)
        );

        const error = await client
            .executeSignedRelayRequest({ method: 'POST', baseURL: 'https://api.test/x' })
            .catch(e => e);

        expect(classifyError(error)).toMatchObject({
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            // 만료는 세션이 죽었다는 뜻이 아니다 — 재발급이 답이지 로그아웃이 아니다.
            shouldLogout: false,
            refreshRoute: 'relay',
        });
    });

    // 음성 대조군. 뒤집는 것은 에러의 모양이 아니라 표시라는 것 — 원래 `reportCategory.spec.ts`가
    // 짝으로 들고 있던 검사인데, 자동 에러 리포트 폐지(ADR-0073)로 그 파일이 사라지면서 여기로 옮겼다.
    it('표시가 없는 같은 모양의 에러는 그대로 NETWORK다', async () => {
        execute.mockRejectedValue(networkError());
        const client = createHttpClient(
            lemonSurface,
            portsWith(() => false)
        );

        const error = await client
            .executeSignedRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' })
            .catch(e => e);

        expect(classifyError(error)).toMatchObject({ type: ErrorType.NETWORK, shouldRetry: true });
        // 재발급 대상이 지목되지 않아야 한다 — 회선 장애에 refresh를 쏘게 만들지 않는다.
        expect(classifyError(error).refreshRoute).toBeUndefined();
    });

    it('표시가 JSON 직렬화에 새지 않는다 — 리포트 본문이 오염되면 안 된다', async () => {
        execute.mockRejectedValue(Object.assign(networkError(), { detail: 'x' }));
        const client = createHttpClient(
            lemonSurface,
            portsWith(() => true)
        );

        const error = await client
            .executeSignedRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' })
            .catch(e => e);

        expect(JSON.stringify(error)).toBe(JSON.stringify({ code: 'ERR_NETWORK', detail: 'x' }));
    });
});
