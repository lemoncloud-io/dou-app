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
    buildRequest: jest.fn((_config: { method: string; baseURL: string }) => builder),
    buildSignedRequest: jest.fn((_config: { method: string; baseURL: string }) => builder),
};

/** Axios' shape for "the request never came back with a response". */
const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

/** `.catch(e => e)` hands back `unknown`; the cases below assert on the axios error's own fields. */
type ThrownAxiosError = Error & { code?: string };

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
        expect((error as ThrownAxiosError).message).toBe('Network Error');
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
        expect((error as ThrownAxiosError).code).toBe('ERR_NETWORK');
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
            // Expiry doesn't mean the session is dead — reissuing credentials is the answer, not logging out.
            shouldLogout: false,
            refreshRoute: 'relay',
        });
    });

    // Negative control. What flips the classification is the marker, not the error's shape — this
    // check used to live paired in `reportCategory.spec.ts`, and moved here when that file was
    // removed by the automatic error report's retirement (ADR-0073).
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
        // No reissue target should be named — a connectivity failure shouldn't trigger a refresh.
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
