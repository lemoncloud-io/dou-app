import type { IKeyValueStorage } from '../../database';
import type { ILogService } from '../log';
import { BootMetricsService, type BootRecord } from './BootMetricsService';

const createStorage = (): IKeyValueStorage & { data: Map<string, unknown> } => {
    const data = new Map<string, unknown>();
    return {
        data,
        set: jest.fn(async (key: string, value: unknown) => {
            data.set(key, value);
        }),
        get: jest.fn(async (key: string) => (data.has(key) ? data.get(key) : null)) as IKeyValueStorage['get'],
        setSync: jest.fn((key: string, value: unknown) => {
            data.set(key, value);
        }),
        getSync: jest.fn((key: string) => (data.has(key) ? data.get(key) : null)) as IKeyValueStorage['getSync'],
        remove: jest.fn(async (key: string) => {
            data.delete(key);
        }),
        clearAll: jest.fn(async () => data.clear()),
        getAllKeys: jest.fn(() => [...data.keys()]),
    };
};

const logService = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as ILogService;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('BootMetricsService — 부팅 기록', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const createService = (storage = createStorage()) => {
        let currentMs = 1_000;
        const service = new BootMetricsService(logService, storage, '1.2.3', () => currentMs);
        return { service, storage, advance: (ms: number) => (currentMs += ms) };
    };

    it('마일스톤을 베이스라인 기준 상대값으로 기록하고 WebAppReady + 웹 스냅샷 도착 시 확정 저장한다', async () => {
        const { service, storage, advance } = createService();

        advance(100);
        service.mark('provider-ready');
        advance(400);
        service.mark('load-start');
        advance(1500);
        service.attachWebMetrics({ marks: { mainStartMs: 300 } });
        service.mark('web-app-ready');
        await flush();

        const records = (await storage.get('bootMetrics.records')) as BootRecord[];
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            type: 'cold',
            appVersion: '1.2.3',
            native: { 'provider-ready': 100, 'load-start': 500, 'web-app-ready': 2000 },
            web: { marks: { mainStartMs: 300 } },
            totalMs: 2000,
        });
    });

    it('같은 마일스톤은 최초 1회만 기록한다 (SPA 재로드 이벤트 무시)', async () => {
        const { service, storage, advance } = createService();
        advance(200);
        service.mark('load-start');
        advance(999);
        service.mark('load-start');
        service.attachWebMetrics({ marks: {} });
        service.mark('web-app-ready');
        await flush();

        const records = (await storage.get('bootMetrics.records')) as BootRecord[];
        expect(records[0].native['load-start']).toBe(200);
    });

    it('웹 스냅샷이 안 오면 타임아웃 후 web=null로 저장한다', async () => {
        jest.useFakeTimers();
        const { service, storage } = createService();
        service.mark('web-app-ready');

        jest.advanceTimersByTime(5000);
        jest.useRealTimers();
        await flush();

        const records = (await storage.get('bootMetrics.records')) as BootRecord[];
        expect(records).toHaveLength(1);
        expect(records[0].web).toBeNull();
    });

    it('reload 세션은 카운트를 올리고 새 베이스라인으로 reload 유형 기록을 만든다', async () => {
        const { service, storage, advance } = createService();
        service.attachWebMetrics({ marks: {} });
        service.mark('web-app-ready');
        await flush();

        advance(10_000);
        service.startReloadSession();
        expect(service.getContentProcessReloadCount()).toBe(1);

        advance(700);
        service.mark('web-app-ready');
        service.attachWebMetrics({ marks: {} });
        await flush();

        const records = (await storage.get('bootMetrics.records')) as BootRecord[];
        expect(records).toHaveLength(2);
        // Newest first.
        expect(records[0]).toMatchObject({ type: 'reload', totalMs: 700 });
        expect(records[1].type).toBe('cold');
    });

    it('기록은 최근 50건으로 제한된다', async () => {
        const storage = createStorage();
        const seed: BootRecord[] = Array.from({ length: 50 }, (_, i) => ({
            finalizedAt: i,
            type: 'cold',
            appVersion: 'x',
            native: {},
            web: null,
            totalMs: i,
        }));
        storage.data.set('bootMetrics.records', seed);

        const { service } = createService(storage);
        service.attachWebMetrics({ marks: {} });
        service.mark('web-app-ready');
        await flush();

        const records = (await storage.get('bootMetrics.records')) as BootRecord[];
        expect(records).toHaveLength(50);
        expect(records[0].appVersion).toBe('1.2.3');
    });

    it('포그라운드 복귀 소요시간을 보관한다', () => {
        const { service } = createService();
        expect(service.getLastForegroundResumeMs()).toBeNull();
        service.recordForegroundResume(432.7);
        expect(service.getLastForegroundResumeMs()).toBe(433);
    });
});
