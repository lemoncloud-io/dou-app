import { createSocketDataSources } from './socketFactory';
import { RELAY_SLOT } from '@chatic/transport/socket/utils/slotKey';

const activeRequest = jest.fn().mockResolvedValue({});
const relayRequest = jest.fn().mockResolvedValue({});
const cloudRequest = jest.fn().mockResolvedValue({});

const scopedClients: Record<string, { request: jest.Mock; send: jest.Mock }> = {
    [RELAY_SLOT]: { request: relayRequest, send: jest.fn() },
};

const socketManager = {
    request: activeRequest,
    send: jest.fn(),
    onType: jest.fn().mockReturnValue(() => undefined),
    getScopedClient: jest.fn((kind: string) => scopedClients[kind]),
};

jest.mock('@chatic/transport/socket/runtime', () => ({ getSocketManager: () => socketManager }));

describe('createSocketDataSources — relay-pinned gateways', () => {
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
        ['cancelInvite', 'invite.cancel', 'invt:1:abc'],
        ['rejectInvite', 'invite.reject', 'invt:1:abc'],
    ])('sends %s over the relay slot', async (method, type, input) => {
        const { socketDataSources } = createSocketDataSources();

        await (socketDataSources.invite as any)[method](input);

        expectRelayOnly(type);
    });

    it('sends invite.list over the relay slot', async () => {
        const { socketDataSources } = createSocketDataSources();

        await socketDataSources.invite.listInvites({ state: 'pending' });

        expectRelayOnly('invite.list');
    });

    it('sends the account-proof packet over the relay slot on every step', async () => {
        const { socketDataSources } = createSocketDataSources();

        await socketDataSources.auth.sendPhoneCode('01012345678', { mode: 'login' });
        expectRelayOnly('auth.link-account');

        relayRequest.mockClear();
        await socketDataSources.auth.verifyPhoneCode('01012345678', '123456', { mode: 'link' });
        expectRelayOnly('auth.link-account');

        relayRequest.mockClear();
        await socketDataSources.auth.confirmPhoneCode('01012345678', '123456', { mode: 'login' });
        expectRelayOnly('auth.link-account');

        relayRequest.mockClear();
        await socketDataSources.auth.confirmSocialAccount({ provider: 'google', idToken: 'tok' });
        expectRelayOnly('auth.link-account');
    });

    it('sends cloud.update over the relay slot — the relay owns the catalog row being renamed', async () => {
        const { socketDataSources } = createSocketDataSources();

        await socketDataSources.cloud.updateCloud({ id: 'cloud-a', name: 'Renamed' } as any, { cid: 'cloud-a' });

        expectRelayOnly('cloud.update');
        expect(relayRequest).toHaveBeenCalledWith(
            'cloud.update',
            expect.objectContaining({ id: 'cloud-a' }),
            undefined
        );
    });

    it('sends cloud.get over the relay slot — the cloud server copy of the row is never read', async () => {
        const { socketDataSources } = createSocketDataSources();

        await socketDataSources.cloud.getCloud({ id: 'cloud-a' } as any, { cid: 'cloud-a' });

        expectRelayOnly('cloud.get');
        expect(relayRequest).toHaveBeenCalledWith('cloud.get', expect.objectContaining({ id: 'cloud-a' }), undefined);
    });

    it('exposes no auth.update sender at all — the handshake belongs to the SDK AuthController', () => {
        const { socketDataSources } = createSocketDataSources();

        expect('updateSocketAuth' in socketDataSources.auth).toBe(false);
    });
});

describe('createSocketDataSources — bound to one slot', () => {
    const slotRequest = jest.fn().mockResolvedValue({ list: [] });
    const slotClient = { request: slotRequest, send: jest.fn(), onType: jest.fn().mockReturnValue(() => undefined) };

    beforeEach(() => {
        activeRequest.mockClear();
        relayRequest.mockClear();
        slotRequest.mockClear();
    });

    const expectRelayOnlyFor = (type: string) => {
        expect(relayRequest).toHaveBeenCalledWith(type, expect.anything(), undefined);
        expect(activeRequest).not.toHaveBeenCalled();
    };

    it('sends the cloud domains through the client it was given, not the active facade', async () => {
        const { socketDataSources } = createSocketDataSources(slotClient);

        await socketDataSources.channel.fetchChannel({ sid: 'site-1' } as any, { cid: 'cloud-a' });

        expect(slotRequest).toHaveBeenCalledWith('channel.mine', expect.anything(), undefined);
        expect(activeRequest).not.toHaveBeenCalled();
    });

    it('sends the single-channel snapshot through the client it was given', async () => {
        slotRequest.mockResolvedValueOnce({ id: 'ch-1' });
        const { socketDataSources } = createSocketDataSources(slotClient);

        await socketDataSources.channel.getChannel({ id: 'ch-1' }, { cid: 'cloud-a', sid: 'site-1', uid: 'me' });

        expect(slotRequest).toHaveBeenCalledWith('channel.get', { id: 'ch-1' }, undefined);
        expect(activeRequest).not.toHaveBeenCalled();
    });

    it("sends the cloud's mini apps through the client it was given, never the relay", async () => {
        const { socketDataSources } = createSocketDataSources(slotClient);

        await socketDataSources.miniApp.listMiniApps();

        expect(slotRequest).toHaveBeenCalledWith('miniapp.list', {}, undefined);
        expect(relayRequest).not.toHaveBeenCalled();
        expect(activeRequest).not.toHaveBeenCalled();
    });

    it('still pins the relay-owned domains to the relay slot', async () => {
        const { socketDataSources } = createSocketDataSources(slotClient);

        await socketDataSources.invite.listInvites({ state: 'pending' });

        expectRelayOnlyFor('invite.list');
        expect(slotRequest).not.toHaveBeenCalled();
    });

    it.each([
        ['getCloud', 'cloud.get', { id: 'cloud-a' }],
        ['updateCloud', 'cloud.update', { id: 'cloud-a', name: 'Renamed' }],
    ])('still sends %s to the relay slot, not the cloud it was given', async (method, type, input) => {
        const { socketDataSources } = createSocketDataSources(slotClient);

        await (socketDataSources.cloud as any)[method](input, { cid: 'cloud-a' });

        expectRelayOnlyFor(type);
        expect(slotRequest).not.toHaveBeenCalled();
    });
});

describe('createSocketDataSources — my devices follow the active slot', () => {
    const slotRequest = jest.fn().mockResolvedValue({ list: [], at: 0 });
    const slotClient = { request: slotRequest, send: jest.fn(), onType: jest.fn().mockReturnValue(() => undefined) };

    beforeEach(() => {
        activeRequest.mockClear();
        relayRequest.mockClear();
        slotRequest.mockClear();
    });

    it('sends user.list-device through the active facade, not the relay slot', async () => {
        const { socketDataSources } = createSocketDataSources();

        await socketDataSources.user.listDevices();

        expect(activeRequest).toHaveBeenCalledWith('user.list-device', null, undefined);
        expect(relayRequest).not.toHaveBeenCalled();
    });

    it('sends user.unlink-device through the active facade, not the relay slot', async () => {
        const { socketDataSources } = createSocketDataSources();

        await socketDataSources.user.unlinkDevice('dev-2');

        expect(activeRequest).toHaveBeenCalledWith('user.unlink-device', { deviceId: 'dev-2' }, undefined);
        expect(relayRequest).not.toHaveBeenCalled();
    });

    it.each([
        ['listDevices', 'user.list-device', [], null],
        ['unlinkDevice', 'user.unlink-device', ['dev-2'], { deviceId: 'dev-2' }],
    ])('sends %s to the cloud a scoped graph was built for', async (method, type, args, data) => {
        const { socketDataSources } = createSocketDataSources(slotClient);

        await (socketDataSources.user as any)[method](...args);

        expect(slotRequest).toHaveBeenCalledWith(type, data, undefined);
        expect(activeRequest).not.toHaveBeenCalled();
        expect(relayRequest).not.toHaveBeenCalled();
    });
});
