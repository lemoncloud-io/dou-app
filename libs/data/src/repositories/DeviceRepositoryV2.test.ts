import { DeviceRepositoryV2 } from './DeviceRepositoryV2';

describe('DeviceRepositoryV2', () => {
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
        const repository = new DeviceRepositoryV2(deviceSocketDataSource as any, contextProvider as any);

        return { repository, deviceSocketDataSource };
    };

    it('채널 진입 통지는 viewingType/viewingId 짝으로 device.sync에 위임한다', () => {
        const { repository, deviceSocketDataSource } = createRepository();

        repository.syncDevice('channel', 'channel-1');

        expect(deviceSocketDataSource.syncDevice).toHaveBeenCalledWith({
            viewingType: 'channel',
            viewingId: 'channel-1',
        });
    });

    it('clear 통지는 빈 짝으로 device.sync에 위임한다', () => {
        const { repository, deviceSocketDataSource } = createRepository();

        repository.syncDevice('', '');

        expect(deviceSocketDataSource.syncDevice).toHaveBeenCalledWith({ viewingType: '', viewingId: '' });
    });

    it('tick은 절대 전송하지 않는다 (서버 소유)', () => {
        const { repository, deviceSocketDataSource } = createRepository();

        repository.syncDevice('channel', 'channel-1');

        const payload = deviceSocketDataSource.syncDevice.mock.calls[0][0];
        expect(payload).not.toHaveProperty('tick');
    });

    it('status 통지는 status만 단독으로 device.sync에 위임한다 (부분 병합)', () => {
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

    it('updateRemotePushMute는 muted만 담아 위임하고 서버 echo(muted)를 반환한다 (id 미전송)', async () => {
        const { repository, deviceSocketDataSource } = createRepository();
        deviceSocketDataSource.updateRemoteDevice.mockResolvedValue({ muted: true });

        const result = await repository.updateRemotePushMute(true);

        expect(deviceSocketDataSource.updateRemoteDevice).toHaveBeenCalledWith({ muted: true });
        expect(result).toBe(true); // authoritative echo from the server view
        // id는 서버가 커넥션에서 해석하므로 보내지 않는다.
        const [payload] = deviceSocketDataSource.updateRemoteDevice.mock.calls[0];
        expect(payload).not.toHaveProperty('id');
    });

    it('updateRemotePushMute는 응답에 muted가 없으면 요청값으로 폴백한다', async () => {
        const { repository, deviceSocketDataSource } = createRepository();
        deviceSocketDataSource.updateRemoteDevice.mockResolvedValue({}); // legacy/misconfigured backend

        const result = await repository.updateRemotePushMute(true);

        expect(result).toBe(true); // falls back to the requested value
    });
});

describe('DeviceRepositoryV2 — HTTP push registration surface (ADR-0070 2단계 후반)', () => {
    const contextProvider = { getContext: () => ({ cid: 'cloud-a', uid: 'me' }), setContext: () => undefined };

    it('throws a clear error when IDeviceRegistrationHttpSource is not injected', async () => {
        const repository = new DeviceRepositoryV2({} as any, contextProvider as any);

        await expect(repository.registerPushDevice({ token: 't' })).rejects.toThrow('not injected');
    });

    it('delegates to the injected http source', async () => {
        const registerPushDevice = jest.fn().mockResolvedValue({ registered: true });
        const repository = new DeviceRepositoryV2({} as any, contextProvider as any, { registerPushDevice } as any);

        const result = await repository.registerPushDevice({ token: 't' }, { force: true });

        expect(registerPushDevice).toHaveBeenCalledWith({ token: 't' }, { force: true });
        expect(result).toEqual({ registered: true });
    });
});
