import { DeviceRepositoryV2 } from './DeviceRepositoryV2';

describe('DeviceRepositoryV2', () => {
    const createRepository = () => {
        // Device viewing has no local cache; only the remote sync path is exercised.
        const deviceRemoteDataSource = {
            saveDevice: jest.fn(),
            readDevice: jest.fn(),
            syncDevice: jest.fn(),
            updateRemoteDevice: jest.fn().mockResolvedValue({}),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };
        const repository = new DeviceRepositoryV2(deviceRemoteDataSource as any, contextProvider as any);

        return { repository, deviceRemoteDataSource };
    };

    it('채널 진입 통지는 viewingType/viewingId 짝으로 device.sync에 위임한다', () => {
        const { repository, deviceRemoteDataSource } = createRepository();

        repository.syncDevice('channel', 'channel-1');

        expect(deviceRemoteDataSource.syncDevice).toHaveBeenCalledWith({
            viewingType: 'channel',
            viewingId: 'channel-1',
        });
    });

    it('clear 통지는 빈 짝으로 device.sync에 위임한다', () => {
        const { repository, deviceRemoteDataSource } = createRepository();

        repository.syncDevice('', '');

        expect(deviceRemoteDataSource.syncDevice).toHaveBeenCalledWith({ viewingType: '', viewingId: '' });
    });

    it('tick은 절대 전송하지 않는다 (서버 소유)', () => {
        const { repository, deviceRemoteDataSource } = createRepository();

        repository.syncDevice('channel', 'channel-1');

        const payload = deviceRemoteDataSource.syncDevice.mock.calls[0][0];
        expect(payload).not.toHaveProperty('tick');
    });

    it('status 통지는 status만 단독으로 device.sync에 위임한다 (부분 병합)', () => {
        const { repository, deviceRemoteDataSource } = createRepository();

        repository.syncStatus('green');

        // Partial merge on the server: viewing fields must be absent, not empty strings,
        // or the send would clear the viewing pair.
        expect(deviceRemoteDataSource.syncDevice).toHaveBeenCalledWith({ status: 'green' });
        const payload = deviceRemoteDataSource.syncDevice.mock.calls[0][0];
        expect(payload).not.toHaveProperty('viewingType');
        expect(payload).not.toHaveProperty('viewingId');
        expect(payload).not.toHaveProperty('tick');
    });

    it('updateRemotePushMute는 muted만 담아 route를 그대로 넘긴다 (id 미전송)', async () => {
        const { repository, deviceRemoteDataSource } = createRepository();

        await repository.updateRemotePushMute(true, { route: 'relay' });

        expect(deviceRemoteDataSource.updateRemoteDevice).toHaveBeenCalledWith({ muted: true }, 'relay');
        // id는 서버가 커넥션에서 해석하므로 보내지 않는다.
        const [payload] = deviceRemoteDataSource.updateRemoteDevice.mock.calls[0];
        expect(payload).not.toHaveProperty('id');
    });

    it('updateRemotePushMute는 route 미지정 시 undefined로 위임한다 (data-source 기본값이 active)', async () => {
        const { repository, deviceRemoteDataSource } = createRepository();

        await repository.updateRemotePushMute(false);

        expect(deviceRemoteDataSource.updateRemoteDevice).toHaveBeenCalledWith({ muted: false }, undefined);
    });
});
