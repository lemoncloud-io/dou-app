import { NOOP_PERF_METRIC_REPORTER } from './PerfMetricReporter';
import { createPerfMetricReporter } from './createPerfMetricReporter';

import type { PerfMetricSink } from './PerfMetricSink';
import type { PerfMetricRecord } from './types';

const createSink = () => {
    const emitted: PerfMetricRecord[] = [];
    return { emitted, emit: (r: PerfMetricRecord) => emitted.push(r) };
};

describe('createPerfMetricReporter', () => {
    it('runId가 없으면 no-op을 준다 — 두 런타임이 합의할 수 없는 세션은 표본이 아니다', () => {
        const sink = createSink();

        expect(createPerfMetricReporter({ sink, runId: undefined })).toBe(NOOP_PERF_METRIC_REPORTER);
        expect(createPerfMetricReporter({ sink, runId: '' })).toBe(NOOP_PERF_METRIC_REPORTER);
    });

    it('샘플에서 빠진 런은 no-op을 준다', () => {
        const sink = createSink();

        const reporter = createPerfMetricReporter({ sink: sink as PerfMetricSink, runId: 'run-1', samplePercent: 0 });

        expect(reporter).toBe(NOOP_PERF_METRIC_REPORTER);
        reporter.report('boot', 1099);
        expect(sink.emitted).toHaveLength(0);
    });

    it('뽑힌 런은 실제 리포터를 준다', () => {
        const sink = createSink();

        const reporter = createPerfMetricReporter({ sink: sink as PerfMetricSink, runId: 'run-1', samplePercent: 100 });

        expect(reporter).not.toBe(NOOP_PERF_METRIC_REPORTER);
        reporter.report('boot', 1099);
        expect(sink.emitted).toHaveLength(1);
    });

    it('같은 runId는 몇 번을 물어도 같은 쪽으로 간다 — 판정이 순수함수라서', () => {
        const sink = createSink();
        const verdicts = Array.from({ length: 5 }, () =>
            createPerfMetricReporter({ sink: sink as PerfMetricSink, runId: 'run-abc' })
        ).map(reporter => reporter === NOOP_PERF_METRIC_REPORTER);

        expect(new Set(verdicts).size).toBe(1);
    });

    it('예산 카탈로그를 주면 그것을 쓴다', () => {
        const sink = createSink();

        const reporter = createPerfMetricReporter({
            sink: sink as PerfMetricSink,
            runId: 'run-1',
            samplePercent: 100,
            budgets: { budgetFor: () => ({ ms: 42, stat: 'p95' }) },
        });
        reporter.report('boot', 100);

        expect(sink.emitted[0]).toEqual(expect.objectContaining({ budgetMs: 42, overBudget: true }));
    });
});
