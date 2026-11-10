/**
 * @jest-environment node
 */
import { createRequestTransport } from './requestTransport';

import type { RequestSigningPorts } from './requestTransport';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

const fakeAxios = () => {
    const request = jest.fn(async (config: AxiosRequestConfig) => ({ data: { ok: true }, config }));
    return { instance: { request } as unknown as AxiosInstance, request };
};

const signing = (overrides: Partial<RequestSigningPorts> = {}): RequestSigningPorts => ({
    credential: () => ({ accessKey: 'AKIA', secretKey: 'secret', sessionToken: 'session' }),
    identityToken: () => 'identity-jwt',
    region: () => 'ap-northeast-2',
    onUnsigned: jest.fn(),
    ...overrides,
});

const sentHeaders = (request: jest.Mock): Record<string, string> =>
    (request.mock.calls[0][0] as AxiosRequestConfig).headers as Record<string, string>;

describe('createRequestTransport', () => {
    it('sends a plain request with only the JSON content type', async () => {
        const { instance, request } = fakeAxios();
        const transport = createRequestTransport(signing(), instance);

        await transport
            .buildRequest({ method: 'GET', baseURL: 'https://api.example.com/v1/x' })
            .setParams({ a: 1 })
            .execute();

        expect(sentHeaders(request)).toEqual({ 'Content-Type': 'application/json' });
        expect(request.mock.calls[0][0]).toMatchObject({ method: 'GET', params: { a: 1 } });
    });

    it('signs a signed request and names the caller in x-lemon-identity', async () => {
        const { instance, request } = fakeAxios();
        const transport = createRequestTransport(signing(), instance);

        await transport
            .buildSignedRequest({ method: 'POST', baseURL: 'https://api.example.com/v1/x' })
            .setBody({ name: 'n' })
            .execute();

        const headers = sentHeaders(request);
        expect(headers['Authorization']).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA\//);
        expect(headers['x-amz-security-token']).toBe('session');
        expect(headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
        expect(headers['x-lemon-identity']).toBe('identity-jwt');
        expect(headers['Content-Type']).toBe('application/json');
        expect(request.mock.calls[0][0]).toMatchObject({ data: { name: 'n' } });
    });

    it('reads the credential when the request is sent, not when it is built', async () => {
        const { instance, request } = fakeAxios();
        let accessKey = 'OLD';
        const transport = createRequestTransport(
            signing({ credential: () => ({ accessKey, secretKey: 'secret' }) }),
            instance
        );
        const builder = transport.buildSignedRequest({ method: 'GET', baseURL: 'https://api.example.com/v1/x' });

        accessKey = 'RENEWED';
        await builder.execute();

        expect(sentHeaders(request)['Authorization']).toContain('Credential=RENEWED/');
    });

    it('sends a signed request unsigned, and says so, when there is no credential', async () => {
        const { instance, request } = fakeAxios();
        const ports = signing({ credential: () => null });
        const transport = createRequestTransport(ports, instance);

        await transport.buildSignedRequest({ method: 'GET', baseURL: 'https://api.example.com/v1/x' }).execute();

        expect(sentHeaders(request)).toEqual({ 'Content-Type': 'application/json' });
        expect(ports.onUnsigned).toHaveBeenCalledTimes(1);
    });

    it('refuses a request without a method or a base URL', () => {
        const transport = createRequestTransport(signing(), fakeAxios().instance);
        expect(() => transport.buildRequest({ baseURL: 'https://api.example.com' })).toThrow('method');
        expect(() => transport.buildSignedRequest({ method: 'GET' })).toThrow('baseURL');
    });
});
