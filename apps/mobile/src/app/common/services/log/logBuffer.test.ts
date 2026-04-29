import { createLogBufferService } from './logBuffer';

const mockSubscribe = jest.fn();
const mockStorageLoad = jest.fn();
const mockStorageSave = jest.fn();

jest.mock('./log', () => ({
    logger: {
        subscribe: (...args: unknown[]) => mockSubscribe(...args),
    },
}));

jest.mock('./logStorage', () => ({
    mmkvLogStorage: {
        load: (...args: unknown[]) => mockStorageLoad(...args),
        save: (...args: unknown[]) => mockStorageSave(...args),
    },
}));

describe('logBufferService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStorageLoad.mockResolvedValue([]);
        mockStorageSave.mockResolvedValue(undefined);
    });

    it('구독으로 받은 로그를 큐에 append하고 저장해야 한다', async () => {
        const storage = {
            load: jest.fn().mockResolvedValue([]),
            save: jest.fn().mockResolvedValue(undefined),
        };

        let listener: ((...args: unknown[]) => void) | undefined;
        mockSubscribe.mockImplementation((cb: (...args: unknown[]) => void) => {
            listener = cb;
            return jest.fn();
        });

        const service = createLogBufferService(storage);
        await service.init();

        listener?.('info', 'APP', '로그 수신', { a: 1 }, undefined);
        await Promise.resolve();

        expect(service.getSize()).toBe(1);
        const [first] = service.peek(1);
        expect(first.tag).toBe('APP');
        expect(first.message).toBe('로그 수신');
        expect(first.data).toEqual({ a: 1 });
        expect(storage.save).toHaveBeenCalled();
    });

    it('poll은 앞에서 count만큼 꺼내고 큐를 저장해야 한다', async () => {
        const loaded = [
            { tag: 'APP', message: 'm1', timestamp: 1 },
            { tag: 'APP', message: 'm2', timestamp: 2 },
            { tag: 'APP', message: 'm3', timestamp: 3 },
        ];
        const storage = {
            load: jest.fn().mockResolvedValue(loaded),
            save: jest.fn().mockResolvedValue(undefined),
        };
        mockSubscribe.mockReturnValue(jest.fn());

        const service = createLogBufferService(storage);
        await service.init();

        const polled = await service.poll(2);

        expect(polled).toHaveLength(2);
        expect(polled[0].message).toBe('m1');
        expect(polled[1].message).toBe('m2');
        expect(service.getSize()).toBe(1);
        expect(service.peek(1)[0].message).toBe('m3');
        expect(storage.save).toHaveBeenCalled();
    });

    it('clear는 큐를 비우고 저장해야 한다', async () => {
        const loaded = [{ tag: 'APP', message: 'm1', timestamp: 1 }];
        const storage = {
            load: jest.fn().mockResolvedValue(loaded),
            save: jest.fn().mockResolvedValue(undefined),
        };
        mockSubscribe.mockReturnValue(jest.fn());

        const service = createLogBufferService(storage);
        await service.init();
        await service.clear();

        expect(service.getSize()).toBe(0);
        expect(storage.save).toHaveBeenCalled();
    });

    it('setStorage는 저장소를 교체하고 새 저장소 기준으로 큐를 다시 로드해야 한다', async () => {
        const storageA = {
            load: jest.fn().mockResolvedValue([{ tag: 'APP', message: 'A', timestamp: 1 }]),
            save: jest.fn().mockResolvedValue(undefined),
        };
        const storageB = {
            load: jest.fn().mockResolvedValue([{ tag: 'APP', message: 'B', timestamp: 2 }]),
            save: jest.fn().mockResolvedValue(undefined),
        };
        mockSubscribe.mockReturnValue(jest.fn());

        const service = createLogBufferService(storageA);
        await service.init();
        expect(service.peek(1)[0].message).toBe('A');

        await service.setStorage(storageB);

        expect(storageB.load).toHaveBeenCalledWith('@chatic/log.queue');
        expect(service.peek(1)[0].message).toBe('B');
    });
});
