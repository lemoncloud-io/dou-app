import { DeviceRepository } from './DeviceRepository';
import type { DeviceSaveInput, DeviceReadInput, DeviceSyncInput } from '@lemoncloud/chatic-sockets-api';

describe('DeviceRepository', () => {
    const createRepository = () => {
        const remote = {
            saveDevice: jest.fn().mockResolvedValue({ id: 'dev-1', name: 'iPhone 15' }),
            readDevice: jest.fn().mockResolvedValue({ id: 'dev-1', name: 'iPhone 15' }),
            syncDevice: jest.fn().mockResolvedValue(null),
        };

        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
            setContext: () => undefined,
        };

        const domainEventBus = {
            on: jest.fn(() => () => undefined),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        const repository = new DeviceRepository(remote as any, contextProvider, domainEventBus as any);

        return { repository, remote };
    };

    it('saveDevice 호출 시 remoteDataSource.saveDevice를 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload: DeviceSaveInput = { name: 'iPhone 15' };

        const result = await repository.saveDevice(payload);

        expect(remote.saveDevice).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'dev-1', name: 'iPhone 15' });
    });

    it('readDevice 호출 시 remoteDataSource.readDevice를 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload: DeviceReadInput = { id: 'dev-1' };

        const result = await repository.readDevice(payload);

        expect(remote.readDevice).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'dev-1', name: 'iPhone 15' });
    });

    it('syncDevice 호출 시 remoteDataSource.syncDevice를 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload: DeviceSyncInput = { tick: 123 };

        const result = await repository.syncDevice(payload);

        expect(remote.syncDevice).toHaveBeenCalledWith(payload);
        expect(result).toBeNull();
    });
});
