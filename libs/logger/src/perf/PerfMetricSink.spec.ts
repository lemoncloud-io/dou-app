import { LoggerPerfMetricSink, PERF_LOG_TAG } from './PerfMetricSink';

import type { Logger } from '../core/types';
import type { PerfMetricRecord } from './types';

const record = (over: Partial<PerfMetricRecord> = {}): PerfMetricRecord => ({
    metric: 'boot',
    ms: 1099,
    budgetMs: 1500,
    overBudget: false,
    ...over,
});

describe('LoggerPerfMetricSink', () => {
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    beforeEach(() => jest.clearAllMocks());

    it('info/PERF 한 건으로 나가고, 숫자는 문장이 아니라 data에 있다', () => {
        new LoggerPerfMetricSink(logger as Logger).emit(record());

        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(PERF_LOG_TAG, 'boot 1099ms', record());
        // The level is a kind, not a severity — metrics never take warn/error.
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('message는 사람이 읽을 한 줄이고 레코드 전체가 data로 간다', () => {
        new LoggerPerfMetricSink(logger as Logger).emit(record({ metric: 'lcp', ms: 2800, overBudget: true }));

        const [, message, data] = logger.info.mock.calls[0];
        expect(message).toBe('lcp 2800ms');
        expect(data).toEqual(expect.objectContaining({ metric: 'lcp', ms: 2800, overBudget: true }));
    });

    it('태그를 갈아끼울 수 있다', () => {
        new LoggerPerfMetricSink(logger as Logger, 'PERF_CANARY').emit(record());

        expect(logger.info).toHaveBeenCalledWith('PERF_CANARY', expect.any(String), expect.any(Object));
    });
});
