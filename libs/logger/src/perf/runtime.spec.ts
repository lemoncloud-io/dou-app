import { configurePerfMetrics, noteQueueDrops, reportPerfMetric, resetPerfMetrics } from './runtime';

import type { Logger } from '../core/types';
import type { PerfMetricRecord } from './types';

const createLogger = () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });

const createSink = () => {
    const emitted: PerfMetricRecord[] = [];
    return { emitted, emit: (record: PerfMetricRecord) => emitted.push(record) };
};

describe('perf runtime', () => {
    let logger: ReturnType<typeof createLogger>;

    beforeEach(() => {
        logger = createLogger();
        resetPerfMetrics();
    });

    afterEach(() => resetPerfMetrics());

    it('구성되지 않은 호스트에서는 아무것도 내지 않는다 — 데스크톱·테스트베드·브라우저가 off인 근거', () => {
        expect(() => {
            noteQueueDrops(5);
            reportPerfMetric('boot', 1099);
        }).not.toThrow();
        expect(logger.info).not.toHaveBeenCalled();
    });

    it('뽑힌 런을 구성하면 기본 싱크로 info/PERF가 나간다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });

        reportPerfMetric('boot', 1099);

        expect(logger.info).toHaveBeenCalledWith('PERF', 'boot 1099ms', expect.objectContaining({ metric: 'boot' }));
    });

    it('싱크를 주면 logger 대신 그쪽으로 간다 — ADR-0071이 예고한 이전 경로', () => {
        const sink = createSink();

        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100, sink });
        reportPerfMetric('lcp', 2400);

        expect(sink.emitted).toHaveLength(1);
        expect(logger.info).not.toHaveBeenCalled();
    });

    it('미샘플 런은 한 건도 만들지 않는다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 0 });

        reportQueueAndMetric();

        expect(logger.info).not.toHaveBeenCalled();
    });

    it('다시 구성하면 새 리포터가 서고 이전 런의 드롭이 넘어오지 않는다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });
        noteQueueDrops(12);
        reportPerfMetric('fcp', 900);
        expect(logger.info.mock.calls[0][2]).toEqual(expect.objectContaining({ dropped: 12 }));

        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });
        reportPerfMetric('fcp', 900);
        expect(logger.info.mock.calls[1][2]).not.toHaveProperty('dropped');
    });

    it('구성 전의 드롭은 세지 않는다 — 호스트가 배선 순서로 책임진다', () => {
        noteQueueDrops(5);

        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });
        reportPerfMetric('fcp', 900);

        expect(logger.info.mock.calls[0][2]).not.toHaveProperty('dropped');
    });

    it('resetPerfMetrics가 다시 끈다', () => {
        configurePerfMetrics({ logger: logger as Logger, runId: 'run-1', samplePercent: 100 });
        resetPerfMetrics();

        reportPerfMetric('boot', 1099);

        expect(logger.info).not.toHaveBeenCalled();
    });

    const reportQueueAndMetric = () => {
        noteQueueDrops(3);
        reportPerfMetric('boot', 1099);
    };
});
