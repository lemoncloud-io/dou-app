/**
 * Destination policy for the relay-owned gateways.
 *
 * The 1:1 invite domain and the phone/social identity packets live in the central backend behind
 * the relay server, so they must reach the relay slot even while a cloud slot is active. The policy
 * is fixed here, at composition time — callers get no route argument to forget. Same guarantee the
 * device.update-remote wiring makes; see socket/kind-scoped-routing.md.
 */
import { createRemoteDataSources } from './remoteFactory';

const activeRequest = jest.fn().mockResolvedValue({});
const relayRequest = jest.fn().mockResolvedValue({});
const cloudRequest = jest.fn().mockResolvedValue({});

const scopedClients: Record<string, { request: jest.Mock; send: jest.Mock }> = {
    relay: { request: relayRequest, send: jest.fn() },
    cloud: { request: cloudRequest, send: jest.fn() },
};

const socketManager = {
    request: activeRequest,
    send: jest.fn(),
    onType: jest.fn().mockReturnValue(() => undefined),
    getScopedClient: jest.fn((kind: string) => scopedClients[kind]),
};

jest.mock('../../socket/runtime', () => ({ getSocketRuntime: () => ({ socketManager }) }));

describe('createRemoteDataSources — relay-pinned gateways', () => {
    beforeEach(() => {
        activeRequest.mockClear();
        relayRequest.mockClear();
        cloudRequest.mockClear();
    });

    const expectRelayOnly = (type: string) => {
        expect(relayRequest).toHaveBeenCalledWith(type, expect.anything(), undefined);
        expect(activeRequest).not.toHaveBeenCalled();
        expect(cloudRequest).not.toHaveBeenCalled();
    };

    it.each([
        ['create', 'invite.create', { phone: '01012345678', name: 'kim' }],
        ['get', 'invite.get', { code: 'invt:1:abc' }],
        ['accept', 'invite.accept', { code: 'invt:1:abc' }],
    ])('sends invite.%s over the relay slot', async (method, type, input) => {
        const { gateways } = createRemoteDataSources();

        await (gateways.invite as any)[method](input);

        expectRelayOnly(type);
    });

    it('sends invite.list over the relay slot', async () => {
        const { gateways } = createRemoteDataSources();

        await gateways.invite.list({ state: 'pending' });

        expectRelayOnly('invite.list');
    });

    it('sends the identity packets over the relay slot', async () => {
        const { gateways } = createRemoteDataSources();

        await gateways.auth.verifyHashAlias({ kind: 'phone', step: 'send', phone: '01012345678' });
        expectRelayOnly('auth.verify-hash-alias');

        relayRequest.mockClear();
        await gateways.auth.attachSocial({ provider: 'google', idToken: 'tok' });
        expectRelayOnly('auth.attach-social');
    });

    it('leaves auth.update on the active slot — it authenticates whichever socket is live', async () => {
        const { gateways } = createRemoteDataSources();

        await gateways.auth.update({ token: 'tok' } as never);

        expect(activeRequest).toHaveBeenCalled();
        expect(relayRequest).not.toHaveBeenCalled();
    });
});
