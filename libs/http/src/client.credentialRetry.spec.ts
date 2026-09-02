import { createHttpClient } from './client';

import type { LemonRequestBuilder, LemonRequestSurface } from './adapters/lemonWebCore';
import type { HttpRoute, HttpRuntimePorts } from './ports';

/**
 * Recover-and-retry-once. The failure being recovered from is an API Gateway IAM rejection, which
 * never reaches a handler — so replaying is safe, and that safety is exactly what the gating rules
 * below protect: only a stale-credential verdict retries, only once, and only to the route that
 * failed.
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

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

interface PortOverrides {
    stale?: boolean;
    recoverCredential?: (route: HttpRoute) => Promise<boolean>;
}

const portsWith = ({ stale = true, recoverCredential }: PortOverrides = {}): HttpRuntimePorts => ({
    resolveEndpoint: () => 'https://api.test',
    isCredentialStale: () => stale,
    recoverCredential,
});

const post = { method: 'POST' as const, baseURL: 'https://api.test/users/0/delegate-cloud' };

beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});

describe('자격증명 만료 실패 — 재발급 후 1회 재시도', () => {
    it('재발급이 성공하면 요청을 한 번 더 보내고 그 결과를 돌려준다', async () => {
        execute.mockRejectedValueOnce(networkError()).mockResolvedValueOnce({ data: { ok: true } });
        const recover = jest.fn().mockResolvedValue(true);

        await expect(
            createHttpClient(lemonSurface, portsWith({ recoverCredential: recover })).executeSignedRelayRequest(post)
        ).resolves.toEqual({ ok: true });

        expect(recover).toHaveBeenCalledWith('relay');
        expect(execute).toHaveBeenCalledTimes(2);
    });

    it('재발급이 실패하면 원래 에러를 그대로 던지고 재시도하지 않는다', async () => {
        execute.mockRejectedValue(networkError());
        const recover = jest.fn().mockResolvedValue(false);

        await expect(
            createHttpClient(lemonSurface, portsWith({ recoverCredential: recover })).executeSignedRelayRequest(post)
        ).rejects.toThrow('Network Error');

        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('재시도도 실패하면 거기서 멈춘다 — 루프를 만들지 않는다', async () => {
        execute.mockRejectedValue(networkError());
        const recover = jest.fn().mockResolvedValue(true);

        await expect(
            createHttpClient(lemonSurface, portsWith({ recoverCredential: recover })).executeSignedRelayRequest(post)
        ).rejects.toThrow('Network Error');

        expect(execute).toHaveBeenCalledTimes(2);
        expect(recover).toHaveBeenCalledTimes(1);
    });

    it('자격증명 탓이 아닌 실패는 재발급을 시도조차 하지 않는다', async () => {
        execute.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
        const recover = jest.fn().mockResolvedValue(true);

        await expect(
            createHttpClient(
                lemonSurface,
                portsWith({ stale: false, recoverCredential: recover })
            ).executeSignedRelayRequest(post)
        ).rejects.toThrow('boom');

        expect(recover).not.toHaveBeenCalled();
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('UNSIGNED 요청은 재발급 대상이 아니다', async () => {
        execute.mockRejectedValue(networkError());
        const recover = jest.fn().mockResolvedValue(true);

        await expect(
            createHttpClient(lemonSurface, portsWith({ recoverCredential: recover })).executeRelayRequest({
                method: 'GET',
                baseURL: 'https://api.test/x',
            })
        ).rejects.toThrow('Network Error');

        expect(recover).not.toHaveBeenCalled();
    });

    it('복구가 배선되지 않은 클라이언트는 예전과 동일하게 즉시 실패한다', async () => {
        execute.mockRejectedValue(networkError());

        await expect(createHttpClient(lemonSurface, portsWith()).executeSignedRelayRequest(post)).rejects.toThrow(
            'Network Error'
        );

        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('재발급이 throw해도 원래 요청 에러가 살아남는다 — 복구 실패가 원인을 가리면 안 된다', async () => {
        execute.mockRejectedValue(networkError());
        const recover = jest.fn().mockRejectedValue(new Error('refresh exploded'));

        await expect(
            createHttpClient(lemonSurface, portsWith({ recoverCredential: recover })).executeSignedRelayRequest(post)
        ).rejects.toThrow('Network Error');

        expect(execute).toHaveBeenCalledTimes(1);
    });
});
