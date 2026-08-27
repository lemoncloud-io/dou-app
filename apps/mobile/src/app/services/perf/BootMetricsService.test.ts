import { configurePerfMetrics, resetPerfMetrics } from '@chatic/logger';

import type { Logger } from '@chatic/logger';
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

describe('BootMetricsService — 성능 지표 이벤트 (ADR-0071)', () => {
    const perfLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        resetPerfMetrics();
    });

    afterEach(() => resetPerfMetrics());

    const createService = () => {
        const storage = createStorage();
        let currentMs = 1_000;
        const service = new BootMetricsService(logService, storage, '1.2.3', () => currentMs);
        return { service, storage, advance: (ms: number) => (currentMs += ms) };
    };

    /** Drives a session to a finalized record with `totalMs` set. */
    const bootTo = async (service: BootMetricsService, advance: (ms: number) => void) => {
        advance(100);
        service.mark('provider-ready');
        advance(999);
        service.attachWebMetrics({ marks: {} });
        service.mark('web-app-ready');
        await flush();
    };

    const metricCalls = () =>
        perfLogger.info.mock.calls.filter(([, message]) => !String(message).startsWith('Boot record'));

    it('샘플에 뽑힌 런은 진단 라인은 그대로 두고 구조화 지표를 한 건 더 낸다', async () => {
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 100 });
        const { service, advance } = createService();

        await bootTo(service, advance);

        // The human line is untouched — it goes through the injected logService.
        expect(logService.info).toHaveBeenCalledWith('PERF', 'Boot record persisted (cold, total 1099ms)');
        expect(metricCalls()).toHaveLength(1);
        expect(metricCalls()[0]).toEqual([
            'PERF',
            'boot 1099ms',
            expect.objectContaining({
                metric: 'boot',
                ms: 1099,
                budgetMs: 1500,
                overBudget: false,
                marks: { 'provider-ready': 100, 'web-app-ready': 1099 },
                bootType: 'cold',
            }),
        ]);
    });

    it('리로드 세션은 bootType으로 구분된다 — 콜드 부팅과 다른 베이스라인이라 섞이면 안 된다', async () => {
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 100 });
        const { service, advance } = createService();

        // A WebView content-process crash re-baselines the session as a reload.
        service.startReloadSession();
        advance(700);
        service.attachWebMetrics({ marks: {} });
        service.mark('web-app-ready');
        await flush();

        expect(metricCalls()).toHaveLength(1);
        expect(metricCalls()[0][2]).toEqual(expect.objectContaining({ ms: 700, bootType: 'reload' }));
    });

    it('샘플에서 빠진 런은 진단 라인만 남고 지표는 0건이다', async () => {
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 0 });
        const { service, advance } = createService();

        await bootTo(service, advance);

        expect(logService.info).toHaveBeenCalledWith('PERF', 'Boot record persisted (cold, total 1099ms)');
        expect(metricCalls()).toHaveLength(0);
    });

    it('WebAppReady에 닿지 못한 세션은 저장은 되지만 표본이 되지 않는다', async () => {
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 100 });
        const { service, storage, advance } = createService();

        advance(100);
        service.mark('load-start');
        // A content-process reload persists the aborted session before starting over.
        service.startReloadSession();
        await flush();

        const records = (await storage.get('bootMetrics.records')) as BootRecord[];
        expect(records).toHaveLength(1);
        expect(records[0].totalMs).toBeNull();
        expect(metricCalls()).toHaveLength(0);
    });

    it('예산을 넘긴 부팅은 overBudget으로 표시된다', async () => {
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 100 });
        const { service, advance } = createService();

        advance(2_400);
        service.attachWebMetrics({ marks: {} });
        service.mark('web-app-ready');
        await flush();

        expect(metricCalls()[0][2]).toEqual(expect.objectContaining({ ms: 2400, overBudget: true }));
    });
});
