import { createHttpClient } from './client';

import type { LemonRequestBuilder, LemonRequestSurface } from './adapters/lemonWebCore';
import type { HttpRuntimePorts } from './ports';

// The 200-body `error` convention vs a record's own `error` column. Every relay call funnels
// through the client, so the opt-out has to be exactly opt-in: default stays "reject", and only a
// caller that declares `allowRecordError` gets the body handed back untouched.

const execute = jest.fn();
const builder: LemonRequestBuilder = {
    setBody: jest.fn(() => builder),
    setParams: jest.fn(() => builder),
    execute,
};

// `jest.Mocked<T>` pins each mock's ARGUMENT tuple to the interface's, so a zero-arg implementation
// does not satisfy it — the mock has to declare the config it ignores.
const lemonSurface: jest.Mocked<LemonRequestSurface> = {
    buildRequest: jest.fn((_config: { method: string; baseURL: string }) => builder),
    buildSignedRequest: jest.fn((_config: { method: string; baseURL: string }) => builder),
};

// `resolveEndpoint` is the only required port. There is no `getCredential`/`getIdentityToken` here:
// signing happens inside the lemon builder, so the client never reads credential material itself.
const ports: HttpRuntimePorts = {
    resolveEndpoint: () => 'https://api.test',
};

beforeEach(() => {
    jest.clearAllMocks();
});

const releasedCloud = { id: '1000047', status: 'error', error: '.accountNo[#mock:1] is invalid' };

describe('createHttpClient().executeSignedRelayRequest — 200 body carrying `error`', () => {
    it('rejects with that message by default', async () => {
        execute.mockResolvedValue({ data: { error: 'NOT_FOUND' } });
        const client = createHttpClient(lemonSurface, ports);

        await expect(
            client.executeSignedRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' })
        ).rejects.toThrow('NOT_FOUND');
    });

    it('returns the record untouched when the caller passes allowRecordError', async () => {
        execute.mockResolvedValue({ data: releasedCloud });
        const client = createHttpClient(lemonSurface, ports);

        await expect(
            client.executeSignedRelayRequest({
                method: 'POST',
                baseURL: 'https://api.test/clouds/1000047/release',
                body: {},
                allowRecordError: true,
            })
        ).resolves.toEqual(releasedCloud);
    });

    it('still resolves a clean body without the flag', async () => {
        execute.mockResolvedValue({ data: { id: '1000038', error: null } });
        const client = createHttpClient(lemonSurface, ports);

        await expect(
            client.executeSignedRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' })
        ).resolves.toEqual({
            id: '1000038',
            error: null,
        });
    });

    it('routes through the signed lemon builder, not the unsigned one', async () => {
        execute.mockResolvedValue({ data: { ok: true } });
        const client = createHttpClient(lemonSurface, ports);

        await client.executeSignedRelayRequest({ method: 'GET', baseURL: 'https://api.test/x' });

        expect(lemonSurface.buildSignedRequest).toHaveBeenCalledTimes(1);
        expect(lemonSurface.buildRequest).not.toHaveBeenCalled();
    });
});

describe('createHttpClient().executeRelayRequest', () => {
    it('routes through the unsigned lemon builder', async () => {
        execute.mockResolvedValue({ data: { ok: true } });
        const client = createHttpClient(lemonSurface, ports);

        await client.executeRelayRequest({ method: 'POST', baseURL: 'https://api.test/oauth/login-user' });

        expect(lemonSurface.buildRequest).toHaveBeenCalledTimes(1);
        expect(lemonSurface.buildSignedRequest).not.toHaveBeenCalled();
    });
});

describe('createHttpClient().resolveEndpoint', () => {
    it('passes through to HttpRuntimePorts.resolveEndpoint — gateways build baseURL from this', () => {
        const customPorts: HttpRuntimePorts = { ...ports, resolveEndpoint: route => `https://${route}.test` };
        const client = createHttpClient(lemonSurface, customPorts);

        expect(client.resolveEndpoint('oauth')).toBe('https://oauth.test');
        expect(client.resolveEndpoint('relay')).toBe('https://relay.test');
    });
});
