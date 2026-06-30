import { DeviceRepositoryV2 } from './DeviceRepositoryV2';

describe('DeviceRepositoryV2', () => {
    const createRepository = () => {
        // Device viewing has no local cache; only the remote sync path is exercised.
        const deviceRemoteDataSource = {
            saveDevice: jest.fn(),
            readDevice: jest.fn(),
            syncDevice: jest.fn(),
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
});
