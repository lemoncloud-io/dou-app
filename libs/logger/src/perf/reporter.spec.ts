import {
    PerfMetricReporter,
    configurePerfMetrics,
    isPerfMetricsEnabled,
    noteQueueDrops,
    reportPerfMetric,
    resetPerfMetrics,
} from './reporter';

import type { Logger } from '../core/types';
import type { PerfMetricData } from './types';

const createLogger = () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
});

/** The `data` of the nth `info` call, typed. */
const dataOf = (logger: ReturnType<typeof createLogger>, call = 0): PerfMetricData =>
    logger.info.mock.calls[call][2] as PerfMetricData;

describe('reportPerfMetric', () => {
    let logger: ReturnType<typeof createLogger>;

    beforeEach(() => {
        logger = createLogger();
        resetPerfMetrics();
    });

    afterEach(() => resetPerfMetrics());

    it('구성되지 않은 호스트에서는 아무것도 내지 않는다 — 데스크톱·브라우저가 off인 근거', () => {
        expect(isPerfMetricsEnabled()).toBe(false);

        reportPerfMetric('boot', 1099);

        expect(logger.info).not.toHaveBeenCalled();
    });

    it('runId가 없으면 켜지지 않는다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: undefined, samplePercent: 100 });

        expect(isPerfMetricsEnabled()).toBe(false);
    });

    it('샘플에서 빠진 런은 한 건도 만들지 않는다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 0 });

        reportPerfMetric('boot', 1099);
        reportPerfMetric('lcp', 2400);

        expect(logger.info).not.toHaveBeenCalled();
    });

    it('샘플에 뽑힌 런은 info/PERF 한 건을 낸다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });

        reportPerfMetric('boot', 1099.4);

        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith('PERF', 'boot 1099ms', expect.any(Object));
        expect(dataOf(logger)).toEqual({ metric: 'boot', ms: 1099, budgetMs: 1500, overBudget: false });
    });

    it('예산을 넘으면 overBudget이 참이다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });

        reportPerfMetric('site-switch', 1200);

        expect(dataOf(logger).overBudget).toBe(true);
    });

    it('예산과 정확히 같은 값은 초과가 아니다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });

        reportPerfMetric('site-switch', 1000);

        expect(dataOf(logger).overBudget).toBe(false);
    });

    it('marks·bootType·ok는 준 것만 실린다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });

        reportPerfMetric('boot', 1099, { marks: { 'provider-ready': 41 }, bootType: 'cold' });
        reportPerfMetric('cloud-switch', 800, { ok: false });

        expect(dataOf(logger, 0)).toEqual(
            expect.objectContaining({ marks: { 'provider-ready': 41 }, bootType: 'cold' })
        );
        expect(dataOf(logger, 0)).not.toHaveProperty('ok');
        expect(dataOf(logger, 1)).toEqual(expect.objectContaining({ ok: false }));
        expect(dataOf(logger, 1)).not.toHaveProperty('marks');
        expect(dataOf(logger, 1)).not.toHaveProperty('bootType');
    });

    it('드롭이 없으면 dropped 키 자체가 없고, 있으면 누적값이 실린다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });

        reportPerfMetric('fcp', 900);
        expect(dataOf(logger, 0)).not.toHaveProperty('dropped');

        noteQueueDrops(137);
        reportPerfMetric('lcp', 2400);
        expect(dataOf(logger, 1).dropped).toBe(137);

        // Cumulative: reading it did not consume it.
        reportPerfMetric('lcp', 2500);
        expect(dataOf(logger, 2).dropped).toBe(137);
    });

    it('측정되지 않은 값(NaN·음수)은 표본이 아니다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });

        reportPerfMetric('boot', Number.NaN);
        reportPerfMetric('boot', -1);
        reportPerfMetric('boot', Number.POSITIVE_INFINITY);

        expect(logger.info).not.toHaveBeenCalled();
    });

    it('직렬화 길이가 wire의 2000자 캡에서 멀찍이 떨어져 있다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });
        noteQueueDrops(999);

        reportPerfMetric('boot', 1099, {
            bootType: 'cold',
            marks: {
                'provider-ready': 41,
                'app-mount': 120,
                'main-screen-mount': 240,
                'load-start': 300,
                'load-end': 900,
                'web-app-ready': 1099,
            },
        });

        // If a future mark set pushes this near the cap, this fails before the
        // truncation silently eats the tail of the payload in production.
        expect(JSON.stringify(dataOf(logger)).length).toBeLessThan(600);
    });

    it('resetPerfMetrics가 다시 끈다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });
        resetPerfMetrics();

        reportPerfMetric('boot', 1099);

        expect(logger.info).not.toHaveBeenCalled();
    });
});

describe('PerfMetricReporter', () => {
    let logger: ReturnType<typeof createLogger>;

    beforeEach(() => {
        logger = createLogger();
    });

    it('단독으로 만들 수 있다 — 프로세스 상태를 건드리지 않는다', () => {
        const reporter = new PerfMetricReporter(logger as Logger);

        reporter.report('boot', 1099);

        expect(logger.info).toHaveBeenCalledWith('PERF', 'boot 1099ms', expect.any(Object));
        // The holder stayed empty: this instance is nobody's singleton.
        expect(isPerfMetricsEnabled()).toBe(false);
    });

    it('드롭 총계는 인스턴스마다 따로다', () => {
        const first = new PerfMetricReporter(logger as Logger);
        const second = new PerfMetricReporter(logger as Logger);

        first.noteQueueDrops(9);
        first.report('lcp', 2400);
        second.report('lcp', 2400);

        expect(dataOf(logger, 0).dropped).toBe(9);
        expect(dataOf(logger, 1)).not.toHaveProperty('dropped');
    });

    it('configurePerfMetrics는 매번 새 리포터를 세운다 — 이전 런의 드롭이 넘어오지 않는다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });
        noteQueueDrops(12);
        reportPerfMetric('fcp', 900);
        expect(dataOf(logger, 0).dropped).toBe(12);

        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });
        reportPerfMetric('fcp', 900);
        expect(dataOf(logger, 1)).not.toHaveProperty('dropped');

        resetPerfMetrics();
    });

    it('구성 전의 드롭은 세지 않는다 — 호스트가 배선 순서로 책임진다', () => {
        resetPerfMetrics();
        noteQueueDrops(5);

        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });
        reportPerfMetric('fcp', 900);

        expect(dataOf(logger, 0)).not.toHaveProperty('dropped');
        resetPerfMetrics();
    });
});
