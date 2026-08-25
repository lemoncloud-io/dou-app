import { logHub } from '@chatic/logger';

const set = jest.fn();
const getString = jest.fn();

jest.mock('react-native-mmkv', () => ({
    createMMKV: () => ({
        set: (...args: unknown[]) => set(...args),
        getString: (...args: unknown[]) => getString(...args),
        remove: jest.fn(),
        clearAll: jest.fn(),
        getAllKeys: () => [],
    }),
}));

// Imported after the mock so `MmkvStorage`'s constructor gets the fake.
 
const { MmkvLogUploadQueuePersistence } = require('./persistence');

describe('MmkvLogUploadQueuePersistence — 재진입 방지', () => {
    let published: unknown[];
    let unsubscribe: () => void;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        published = [];
        unsubscribe = logHub.subscribe(entry => published.push(entry));
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        unsubscribe();
        jest.restoreAllMocks();
    });

    it('저장이 실패해도 로그를 발행하지 않는다 — 발행하면 스스로를 되먹인다', () => {
        // MmkvStorage는 실패를 ILogService로 보고한다. 그게 다른 모든 호출자에게는
        // 맞고 이 호출자에게만 틀리다: 여기서 발행하면 hub가 그 엔트리를 저장
        // 리스너에게 주고, 리스너가 다시 저장을 시도하고, 디스크가 계속 불행한
        // 동안 실패가 자기를 재생산한다.
        set.mockImplementation(() => {
            throw new Error('mmkv full');
        });

        expect(() =>
            new MmkvLogUploadQueuePersistence().save([
                { id: 'a', level: 'info', tag: 'TEST', message: 'x', timestamp: 1 },
            ])
        ).not.toThrow();

        expect(published).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('저장은 공유 MmkvStorage를 거친다 — MMKV 접촉이 한 곳에만 있다', () => {
        new MmkvLogUploadQueuePersistence().saveLastLogAt(42);

        // MmkvStorage가 JSON으로 감싸는 것이 그 증거다.
        expect(set).toHaveBeenCalledWith('@chatic/log.last-at', JSON.stringify(42));
    });
});
