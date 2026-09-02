import { createOAuthHttpGateway, isAwsAccountNo } from './oauth';

import type { HttpGatewayExecutor } from './types';

const executeRelayRequest = jest.fn();
const executeSignedRelayRequest = jest.fn();

const exec: HttpGatewayExecutor = {
    executeRelayRequest,
    executeSignedRelayRequest,
    executeCloudRequest: jest.fn(),
    resolveEndpoint: route => `https://${route}.test`,
};

beforeEach(() => jest.clearAllMocks());

describe('createOAuthHttpGateway', () => {
    it('registerDevice — POST {relay}/oauth/register-device, unsigned', async () => {
        executeRelayRequest.mockResolvedValue({ ok: true });
        const gateway = createOAuthHttpGateway(exec);

        await gateway.registerDevice('device-1');

        expect(executeRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/oauth/register-device',
            body: { deviceId: 'device-1' },
        });
        expect(executeSignedRelayRequest).not.toHaveBeenCalled();
    });

    it('registerUserV2 — includes email param only when explicitly passed', async () => {
        executeRelayRequest.mockResolvedValue({});
        const gateway = createOAuthHttpGateway(exec);

        await gateway.registerUserV2({} as never, true);
        expect(executeRelayRequest).toHaveBeenCalledWith(expect.objectContaining({ params: { email: 'true' } }));

        await gateway.registerUserV2({} as never);
        expect(executeRelayRequest).toHaveBeenLastCalledWith(expect.objectContaining({ params: undefined }));
    });

    it('login — POST {relay}/oauth/login-user?token=1', async () => {
        executeRelayRequest.mockResolvedValue({});
        const gateway = createOAuthHttpGateway(exec);

        await gateway.login({ id: 'a', pw: 'b' } as never);

        expect(executeRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/oauth/login-user',
            params: { token: 1 },
            body: { id: 'a', pw: 'b' },
        });
    });

    it('exchangeToken — signed, baseURL is the caller override, not resolveEndpoint', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createOAuthHttpGateway(exec);

        await gateway.exchangeToken({ baseURL: 'https://target-cloud.example', body: { current: 'x' } as never });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://target-cloud.example/oauth/exchange-token',
            body: { current: 'x' },
        });
    });

    it('findAlias / verifyAlias — unsigned relay', async () => {
        executeRelayRequest.mockResolvedValue({});
        const gateway = createOAuthHttpGateway(exec);

        await gateway.findAlias({ type: 'email', alias: 'a@b.com' });
        expect(executeRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/oauth/find-alias',
            body: { type: 'email', alias: 'a@b.com' },
        });

        await gateway.verifyAlias({ type: 'email', mode: 'find', step: 'send', alias: 'a@b.com' });
        expect(executeRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/oauth/verify-alias',
            body: { type: 'email', mode: 'find', step: 'send', alias: 'a@b.com' },
        });
    });

    it('loginInvite — falls back to relay endpoint when no backend override is given', async () => {
        executeRelayRequest.mockResolvedValue({});
        const gateway = createOAuthHttpGateway(exec);

        await gateway.loginInvite({ code: 'invt:1:abc', delegatorId: 'u1' });
        expect(executeRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/oauth/login-invite',
            body: { code: 'invt:1:abc', delegatorId: 'u1' },
        });

        await gateway.loginInvite({ code: 'invt:1:abc', delegatorId: 'u1', backend: 'https://deeplink.test' });
        expect(executeRelayRequest).toHaveBeenLastCalledWith(
            expect.objectContaining({ baseURL: 'https://deeplink.test/oauth/login-invite' })
        );
    });

    it('delegateCloud — refuses an AWS account-no target before making a request', async () => {
        const gateway = createOAuthHttpGateway(exec);

        await expect(gateway.delegateCloud('123456789012')).rejects.toThrow('AWS account-no');
        expect(executeSignedRelayRequest).not.toHaveBeenCalled();
    });

    it('delegateCloud — signed, legacy: false fixed', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createOAuthHttpGateway(exec);

        await gateway.delegateCloud('not-an-account-no');

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/users/0/delegate-cloud',
            body: { target: 'not-an-account-no' },
            params: { legacy: false },
        });
    });

    it('inviteInfo — signed GET against the caller-supplied backend', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createOAuthHttpGateway(exec);

        await gateway.inviteInfo({ code: 'invt:1:abc', backend: 'https://target.test' });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://target.test/hello/invite-code',
            params: { code: 'invt:1:abc' },
        });
    });
});

describe('isAwsAccountNo', () => {
    it('matches a 12-digit string only', () => {
        expect(isAwsAccountNo('123456789012')).toBe(true);
        expect(isAwsAccountNo('12345678901')).toBe(false);
        expect(isAwsAccountNo('not-a-number')).toBe(false);
    });
});
