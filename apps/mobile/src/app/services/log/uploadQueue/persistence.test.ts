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

        expect(set).toHaveBeenCalledWith('@chatic/log.last-at', JSON.stringify(42));
    });
});

describe('MmkvLogUploadQueuePersistence — 저장·복원 왕복', () => {
    const entry = {
        id: 'entry-1',
        level: 'error' as const,
        tag: 'SOCKET',
        message: '404 socket request failed',
        timestamp: 1_700_000_000_000,
        runId: 'run-1',
        uid: 'user-1',
        sid: 'site-1',
        cid: 'cloud-1',
        appVersion: '1.2.3',
        webVersion: '0.59.0',
        route: '/chat/ch-1',
        os: 'ios',
        osVersion: '18.0',
        model: 'iPhone16',
    };

    beforeEach(() => jest.clearAllMocks());

    const savedRecord = () => JSON.parse(set.mock.calls[0][1] as string);

    it('발생 시점 컨텍스트 열 개를 모두 저장한다', () => {
        new MmkvLogUploadQueuePersistence().save([entry]);

        expect(savedRecord()[0]).toMatchObject({
            runId: 'run-1',
            uid: 'user-1',
            sid: 'site-1',
            cid: 'cloud-1',
            appVersion: '1.2.3',
            webVersion: '0.59.0',
            route: '/chat/ch-1',
            os: 'ios',
            osVersion: '18.0',
            model: 'iPhone16',
        });
    });

    it('id를 저장한다', () => {
        new MmkvLogUploadQueuePersistence().save([entry]);

        expect(savedRecord()[0].id).toBe('entry-1');
    });

    it('저장한 것을 그대로 되읽는다', () => {
        const store = new MmkvLogUploadQueuePersistence();
        store.save([entry]);
        getString.mockReturnValue(set.mock.calls[0][1]);

        const [loaded] = store.load();

        expect(loaded.id).toBe('entry-1');
        expect(loaded.uid).toBe('user-1');
        expect(loaded.runId).toBe('run-1');
        expect(loaded.route).toBe('/chat/ch-1');
        expect(loaded.level).toBe('error');
    });
});
