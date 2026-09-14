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

/**
 * 저장·복원 왕복을 검증하는 스위트가 없어서 컨텍스트 유실을 놓쳤다. 저장된 엔트리는 부팅 때
 * 다시 읽혀 그대로 업로더로 가므로, 여기서 빠지는 것은 서버에서도 빠진다.
 */
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

    /** 저장된 레코드를 읽어 되돌린다 — MMKV는 JSON 문자열을 담는다. */
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

    // 호스트가 ack하는 키다(LogUploadQueueService.ack). 없으면 업로드 성공 후에도 큐에서
    // 지워지지 않아 매 주기마다 다시 올라가고, 서버는 dedup할 키가 없어 매번 새 문서로 담는다.
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
