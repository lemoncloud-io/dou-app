import { DeviceRepository } from './DeviceRepository';
import type { DeviceReadInput, DeviceSaveInput, DeviceSyncInput } from '@lemoncloud/chatic-sockets-api';

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

        const listeners = new Map<string, (...args: unknown[]) => void>();
        const domainEventBus = {
            on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
                listeners.set(event, cb);
                return () => listeners.delete(event);
            }),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        const repository = new DeviceRepository(remote as any, contextProvider, domainEventBus as any);

        return { repository, remote, domainEventBus, listeners };
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

    it('device:create 도메인 이벤트 수신 시 로그를 남겨야 한다', () => {
        const { listeners } = createRepository();
        const logSpy = jest.spyOn(console, 'log').mockImplementation();

        const handler = listeners.get('device:create');
        expect(handler).toBeDefined();
        handler!({ data: { id: 'dev-1' } });

        expect(logSpy).toHaveBeenCalledWith('[DeviceRepository] device:create', { id: 'dev-1' });
        logSpy.mockRestore();
    });

    it('device:update 도메인 이벤트 수신 시 로그를 남겨야 한다', () => {
        const { listeners } = createRepository();
        const logSpy = jest.spyOn(console, 'log').mockImplementation();

        const handler = listeners.get('device:update');
        expect(handler).toBeDefined();
        handler!({ data: { id: 'dev-1' } });

        expect(logSpy).toHaveBeenCalledWith('[DeviceRepository] device:update', { id: 'dev-1' });
        logSpy.mockRestore();
    });

    it('device:delete 도메인 이벤트 수신 시 로그를 남겨야 한다', () => {
        const { listeners } = createRepository();
        const logSpy = jest.spyOn(console, 'log').mockImplementation();

        const handler = listeners.get('device:delete');
        expect(handler).toBeDefined();
        handler!({ data: { id: 'dev-1' } });

        expect(logSpy).toHaveBeenCalledWith('[DeviceRepository] device:delete', { id: 'dev-1' });
        logSpy.mockRestore();
    });
});
