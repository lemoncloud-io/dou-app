import { createPairingHttpGateway } from './pairings';

import type { HttpGatewayExecutor } from './types';

const executeRelayRequest = jest.fn();
const executeSignedRelayRequest = jest.fn();
const resolveEndpoint = jest.fn((route: string) => (route === 'relay' ? 'https://relay.test' : 'https://cloud.test'));

const exec: HttpGatewayExecutor = { executeRelayRequest, executeSignedRelayRequest, resolveEndpoint };

beforeEach(() => {
    jest.clearAllMocks();
    executeSignedRelayRequest.mockResolvedValue({});
});

describe('createPairingHttpGateway', () => {
    const gateway = () => createPairingHttpGateway(exec);

    it.each([
        [
            'request',
            () =>
                gateway().request({
                    purpose: 'web',
                    deviceId: 'dev-1',
                    client: { name: 'Chrome · macOS', platform: 'web' },
                }),
            {
                method: 'POST',
                baseURL: 'https://relay.test/pairings/0/request',
                body: { purpose: 'web', deviceId: 'dev-1', client: { name: 'Chrome · macOS', platform: 'web' } },
            },
        ],
        [
            'check',
            () => gateway().check({ code: '07344168' }),
            { method: 'POST', baseURL: 'https://relay.test/pairings/0/check', body: { code: '07344168' } },
        ],
        [
            'approve',
            () => gateway().approve('p-1', { target: { type: 'cloud', cloudId: '1000002' } }),
            {
                method: 'POST',
                baseURL: 'https://relay.test/pairings/p-1/approve',
                body: { target: { type: 'cloud', cloudId: '1000002' } },
            },
        ],
        [
            'deny',
            () => gateway().deny('p-1'),
            { method: 'POST', baseURL: 'https://relay.test/pairings/p-1/deny', body: {} },
        ],
        [
            'claim',
            () => gateway().claim('p-1'),
            { method: 'POST', baseURL: 'https://relay.test/pairings/p-1/claim', body: {} },
        ],
        [
            'revoke',
            () => gateway().revoke('p-1'),
            { method: 'POST', baseURL: 'https://relay.test/pairings/p-1/revoke', body: {} },
        ],
        ['list', () => gateway().list(), { method: 'GET', baseURL: 'https://relay.test/pairings' }],
    ])('%s — signed relay request with its own path and body', async (_name, call, expected) => {
        await call();

        expect(executeSignedRelayRequest).toHaveBeenCalledTimes(1);
        expect(executeSignedRelayRequest).toHaveBeenCalledWith(expected);
    });

    // A cloud server does not serve /pairings: whichever cloud the session works in, every operation
    // is signed and sent to the relay.
    it('never builds a cloud address or sends unsigned', async () => {
        const g = gateway();

        await g.request({ purpose: 'web', deviceId: 'dev-1' });
        await g.check({ code: '07344168' });
        await g.approve('p-1', { target: { type: 'relay' } });
        await g.deny('p-1');
        await g.claim('p-1');
        await g.revoke('p-1');
        await g.list();

        expect(resolveEndpoint.mock.calls.every(([route]) => route === 'relay')).toBe(true);
        expect(executeRelayRequest).not.toHaveBeenCalled();
        expect(executeSignedRelayRequest).toHaveBeenCalledTimes(7);
    });

    it('returns the claim answer as the server sent it', async () => {
        const answer = { status: 'approved', target: { type: 'relay' }, approver: { name: 'a' }, session: { id: 's' } };
        executeSignedRelayRequest.mockResolvedValueOnce(answer);

        await expect(gateway().claim('p-1')).resolves.toBe(answer);
    });
});
