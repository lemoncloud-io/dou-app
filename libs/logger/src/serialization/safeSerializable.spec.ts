import { safeSerializable } from './safeSerializable';

describe('safeSerializable', () => {
    it('returns undefined for null/undefined', () => {
        expect(safeSerializable(undefined)).toBeUndefined();
        expect(safeSerializable(null)).toBeUndefined();
    });

    it('reduces a plain Error to name/message/stack', () => {
        const error = new Error('boom');
        expect(safeSerializable(error)).toEqual({ name: 'Error', message: 'boom', stack: error.stack });
    });

    it('passes serializable values through unchanged', () => {
        const value = { a: 1, b: ['x'] };
        expect(safeSerializable(value)).toBe(value);
    });

    it('stringifies non-serializable values', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(typeof safeSerializable(circular)).toBe('string');
    });

    it('lifts request/response/code off an axios error and masks secrets', () => {
        const axiosError = Object.assign(new Error('Request failed with status code 400'), {
            name: 'AxiosError',
            isAxiosError: true,
            code: 'ERR_BAD_REQUEST',
            config: {
                method: 'post',
                url: '/hello/login',
                baseURL: 'https://dou.chatic.io',
                params: { locale: 'ko' },
                data: { deviceId: 'd1', password: 'secret' },
                headers: { authorization: 'Bearer top-secret' },
            },
            response: { status: 400, statusText: 'Bad Request', data: { error: 'INVALID' } },
        });

        const result = safeSerializable(axiosError) as Record<string, any>;

        expect(result.name).toBe('AxiosError');
        expect(result.code).toBe('ERR_BAD_REQUEST');
        expect(result.request).toMatchObject({
            method: 'post',
            url: '/hello/login',
            baseURL: 'https://dou.chatic.io',
            params: { locale: 'ko' },
            data: { deviceId: 'd1', password: '[REDACTED]' },
        });
        // Headers are intentionally never included (they carry auth tokens).
        expect(result.request.headers).toBeUndefined();
        expect(result.response).toEqual({ status: 400, statusText: 'Bad Request', data: { error: 'INVALID' } });
    });

    it('masks secrets inside a serialized JSON request body (axios stringifies config.data)', () => {
        const axiosError = Object.assign(new Error('Network Error'), {
            name: 'AxiosError',
            isAxiosError: true,
            code: 'ERR_NETWORK',
            config: {
                method: 'post',
                baseURL: 'https://dou.chatic.io/oauth/login',
                data: JSON.stringify({ id: 'u1', password: 'secret', identityToken: 'tok-abc' }),
            },
        });

        const result = safeSerializable(axiosError) as Record<string, any>;

        expect(result.request.data).toEqual({ id: 'u1', password: '[REDACTED]', identityToken: '[REDACTED]' });
    });

    it('keeps code/request even when a network error has no response', () => {
        const networkError = Object.assign(new Error('Network Error'), {
            name: 'AxiosError',
            isAxiosError: true,
            code: 'ERR_NETWORK',
            config: { method: 'get', url: '/hello/keepalive', baseURL: 'https://dou.chatic.io' },
        });

        const result = safeSerializable(networkError) as Record<string, any>;

        expect(result.code).toBe('ERR_NETWORK');
        expect(result.request).toMatchObject({ method: 'get', url: '/hello/keepalive' });
        expect(result.response).toBeUndefined();
    });
});
