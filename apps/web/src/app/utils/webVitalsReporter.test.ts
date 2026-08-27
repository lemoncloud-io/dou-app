import { configurePerfMetrics, resetPerfMetrics } from '@chatic/bridges';

import { getVitals } from './webVitalsStore';
import { receiveVital } from './webVitalsReporter';

import type { Logger } from '@chatic/bridges';
import type { Metric } from 'web-vitals';

const perfLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const vital = (name: Metric['name'], value: number): Metric => ({ name, value, rating: 'good' }) as unknown as Metric;

describe('receiveVital', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetPerfMetrics();
    });

    afterEach(() => resetPerfMetrics());

    it('예산이 없는 지표도 오버레이 스토어에는 전부 들어간다', () => {
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 100 });

        receiveVital(vital('INP', 180));
        receiveVital(vital('CLS', 0.05));
        receiveVital(vital('TTFB', 320));

        expect(getVitals()).toEqual(
            expect.objectContaining({
                INP: { value: 180, rating: 'good' },
                CLS: { value: 0.05, rating: 'good' },
                TTFB: { value: 320, rating: 'good' },
            })
        );
    });

    it('INP·CLS·TTFB는 서버로 나가지 않는다', () => {
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 100 });

        receiveVital(vital('INP', 180));
        receiveVital(vital('CLS', 0.05));
        receiveVital(vital('TTFB', 320));

        expect(perfLogger.info).not.toHaveBeenCalled();
    });

    it('FCP·LCP만 예산 지표로 보고한다', () => {
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 100 });

        receiveVital(vital('FCP', 1_650));
        receiveVital(vital('LCP', 2_800));

        expect(perfLogger.info).toHaveBeenCalledTimes(2);
        expect(perfLogger.info).toHaveBeenNthCalledWith(
            1,
            'PERF',
            'fcp 1650ms',
            expect.objectContaining({ metric: 'fcp', ms: 1650, budgetMs: 1800, overBudget: false })
        );
        expect(perfLogger.info).toHaveBeenNthCalledWith(
            2,
            'PERF',
            'lcp 2800ms',
            expect.objectContaining({ metric: 'lcp', ms: 2800, budgetMs: 2500, overBudget: true })
        );
    });

    it('지표 수집이 꺼진 호스트에서는 스토어만 채우고 서버로는 안 보낸다 (브라우저·데스크톱)', () => {
        receiveVital(vital('LCP', 2_800));

        expect(getVitals().LCP).toEqual({ value: 2800, rating: 'good' });
        expect(perfLogger.info).not.toHaveBeenCalled();
    });
});
