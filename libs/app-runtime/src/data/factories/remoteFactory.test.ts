/**
 * Destination policy for the relay-owned gateways.
 *
 * The 1:1 invite domain and the account-proof packet live in the central backend behind the relay
 * server, so they must reach the relay slot even while a cloud slot is active. The policy is fixed
 * here, at composition time — callers get no route argument to forget. Same guarantee the
 * device.update-remote wiring makes; see socket/kind-scoped-routing.md.
 *
 * Driven through the data sources rather than the gateway bundle: the factory deliberately does not
 * hand the bundle back out (ADR-0036), so the only observable contract is which socket a repository
 * call ends up on — which is also what actually matters.
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
        ['createInvite', 'invite.create', { phone: '01012345678', name: 'kim' }],
        ['getInvite', 'invite.get', 'invt:1:abc'],
        ['acceptInvite', 'invite.accept', 'invt:1:abc'],
    ])('sends %s over the relay slot', async (method, type, input) => {
        const { remoteDataSources } = createRemoteDataSources();

        await (remoteDataSources.invite as any)[method](input);

        expectRelayOnly(type);
    });

    it('sends invite.list over the relay slot', async () => {
        const { remoteDataSources } = createRemoteDataSources();

        await remoteDataSources.invite.listInvites({ state: 'pending' });

        expectRelayOnly('invite.list');
    });

    it('sends the account-proof packet over the relay slot on every step', async () => {
        const { remoteDataSources } = createRemoteDataSources();

        await remoteDataSources.auth.sendPhoneCode('01012345678', { mode: 'login' });
        expectRelayOnly('auth.link-account');

        relayRequest.mockClear();
        await remoteDataSources.auth.verifyPhoneCode('01012345678', '123456', { mode: 'link' });
        expectRelayOnly('auth.link-account');

        relayRequest.mockClear();
        await remoteDataSources.auth.confirmPhoneCode('01012345678', '123456', { mode: 'login' });
        expectRelayOnly('auth.link-account');

        relayRequest.mockClear();
        await remoteDataSources.auth.confirmSocialAccount({ provider: 'google', idToken: 'tok' });
        expectRelayOnly('auth.link-account');
    });

    it('leaves auth.update on the active slot — it authenticates whichever socket is live', async () => {
        const { remoteDataSources } = createRemoteDataSources();

        await remoteDataSources.auth.updateSocketAuth({ token: 'tok' } as never);

        expect(activeRequest).toHaveBeenCalled();
        expect(relayRequest).not.toHaveBeenCalled();
    });
});
