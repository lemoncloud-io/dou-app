import { DeviceRepository } from './DeviceRepository';

describe('DeviceRepository', () => {
    const createRepository = () => {
        // Device viewing has no local cache; only the remote sync path is exercised.
        const deviceSocketDataSource = {
            saveDevice: jest.fn(),
            readDevice: jest.fn(),
            syncDevice: jest.fn(),
            updateRemoteDevice: jest.fn().mockResolvedValue({ muted: true }),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };
        const repository = new DeviceRepository(deviceSocketDataSource as any, contextProvider as any);

        return { repository, deviceSocketDataSource };
    };

    it('a channel-entry notice delegates to device.sync as a viewingType/viewingId pair', () => {
        const { repository, deviceSocketDataSource } = createRepository();

        repository.syncDevice('channel', 'channel-1');

        expect(deviceSocketDataSource.syncDevice).toHaveBeenCalledWith({
            viewingType: 'channel',
            viewingId: 'channel-1',
        });
    });

    it('a clear notice delegates to device.sync as an empty pair', () => {
        const { repository, deviceSocketDataSource } = createRepository();

        repository.syncDevice('', '');

        expect(deviceSocketDataSource.syncDevice).toHaveBeenCalledWith({ viewingType: '', viewingId: '' });
    });

    it('tick is never sent (the server owns it)', () => {
        const { repository, deviceSocketDataSource } = createRepository();

        repository.syncDevice('channel', 'channel-1');

        const payload = deviceSocketDataSource.syncDevice.mock.calls[0][0];
        expect(payload).not.toHaveProperty('tick');
    });

    it('a status notice delegates status alone to device.sync (a partial merge)', () => {
        const { repository, deviceSocketDataSource } = createRepository();

        repository.syncStatus('green');

        // Partial merge on the server: viewing fields must be absent, not empty strings,
        // or the send would clear the viewing pair.
        expect(deviceSocketDataSource.syncDevice).toHaveBeenCalledWith({ status: 'green' });
        const payload = deviceSocketDataSource.syncDevice.mock.calls[0][0];
        expect(payload).not.toHaveProperty('viewingType');
        expect(payload).not.toHaveProperty('viewingId');
        expect(payload).not.toHaveProperty('tick');
    });

    it('updateRemotePushMute delegates carrying muted alone and returns the echo from the server (muted), sending no id', async () => {
        const { repository, deviceSocketDataSource } = createRepository();
        deviceSocketDataSource.updateRemoteDevice.mockResolvedValue({ muted: true });

        const result = await repository.updateRemotePushMute(true);

        expect(deviceSocketDataSource.updateRemoteDevice).toHaveBeenCalledWith({ muted: true });
        expect(result).toBe(true); // authoritative echo from the server view
        // The id is resolved by the server from the connection, so it is not sent.
        const [payload] = deviceSocketDataSource.updateRemoteDevice.mock.calls[0];
        expect(payload).not.toHaveProperty('id');
    });

    it('updateRemotePushMute falls back to the requested value when the response holds no muted', async () => {
        const { repository, deviceSocketDataSource } = createRepository();
        deviceSocketDataSource.updateRemoteDevice.mockResolvedValue({}); // legacy/misconfigured backend

        const result = await repository.updateRemotePushMute(true);

        expect(result).toBe(true); // falls back to the requested value
    });
});

describe('DeviceRepository — HTTP push registration surface (ADR-0070 late stage 2)', () => {
    const contextProvider = { getContext: () => ({ cid: 'cloud-a', uid: 'me' }), setContext: () => undefined };

    it('throws a clear error when IDeviceRegistrationHttpSource is not injected', async () => {
        const repository = new DeviceRepository({} as any, contextProvider as any);

        await expect(repository.registerPushDevice({ token: 't' })).rejects.toThrow('not injected');
    });

    it('delegates to the injected http source', async () => {
        const registerPushDevice = jest.fn().mockResolvedValue({ registered: true });
        const repository = new DeviceRepository({} as any, contextProvider as any, { registerPushDevice } as any);

        const result = await repository.registerPushDevice({ token: 't' }, { force: true });

        expect(registerPushDevice).toHaveBeenCalledWith({ token: 't' }, { force: true });
        expect(result).toEqual({ registered: true });
    });
});
