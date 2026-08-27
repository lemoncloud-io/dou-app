import { BudgetedPerfMetricReporter, NOOP_PERF_METRIC_REPORTER } from './PerfMetricReporter';
import { StaticPerfBudgetCatalog } from './budgets';

import type { PerfBudgetCatalog } from './budgets';
import type { PerfMetricSink } from './PerfMetricSink';
import type { PerfMetricRecord } from './types';

const createSink = () => {
    const emitted: PerfMetricRecord[] = [];
    return { emitted, emit: (record: PerfMetricRecord) => emitted.push(record) } satisfies PerfMetricSink & {
        emitted: PerfMetricRecord[];
    };
};

const build = (budgets: PerfBudgetCatalog = new StaticPerfBudgetCatalog()) => {
    const sink = createSink();
    return { sink, reporter: new BudgetedPerfMetricReporter(sink, budgets) };
};

describe('BudgetedPerfMetricReporter', () => {
    it('측정치를 예산과 함께 레코드로 만들어 싱크에 넘긴다', () => {
        const { sink, reporter } = build();

        reporter.report('boot', 1099.4);

        expect(sink.emitted).toEqual([{ metric: 'boot', ms: 1099, budgetMs: 1500, overBudget: false }]);
    });

    it('예산을 넘으면 overBudget이 참이고, 정확히 같으면 초과가 아니다', () => {
        const { sink, reporter } = build();

        reporter.report('site-switch', 1200);
        reporter.report('site-switch', 1000);

        expect(sink.emitted.map(record => record.overBudget)).toEqual([true, false]);
    });

    it('ok·bootType·marks는 준 것만 실린다', () => {
        const { sink, reporter } = build();

        reporter.report('boot', 1099, { marks: { 'provider-ready': 41, 'load-end': undefined }, bootType: 'cold' });
        reporter.report('cloud-switch', 800, { ok: false });

        expect(sink.emitted[0]).toEqual(expect.objectContaining({ marks: { 'provider-ready': 41 }, bootType: 'cold' }));
        expect(sink.emitted[0]).not.toHaveProperty('ok');
        // A milestone that was never reached leaves no key behind.
        expect(sink.emitted[0].marks).not.toHaveProperty('load-end');
        expect(sink.emitted[1]).toEqual(expect.objectContaining({ ok: false }));
        expect(sink.emitted[1]).not.toHaveProperty('marks');
        expect(sink.emitted[1]).not.toHaveProperty('bootType');
    });

    it('측정되지 않은 값(NaN·음수·Infinity)은 표본이 아니다', () => {
        const { sink, reporter } = build();

        reporter.report('boot', Number.NaN);
        reporter.report('boot', -1);
        reporter.report('boot', Number.POSITIVE_INFINITY);

        expect(sink.emitted).toHaveLength(0);
    });

    it('예산 카탈로그를 갈아끼우면 판정이 그대로 따라온다', () => {
        const tightened: PerfBudgetCatalog = { budgetFor: () => ({ ms: 500, stat: 'p95' }) };
        const { sink, reporter } = build(tightened);

        reporter.report('boot', 900);

        expect(sink.emitted[0]).toEqual(expect.objectContaining({ budgetMs: 500, overBudget: true }));
    });

    it('레코드의 직렬화 길이가 wire의 2000자 캡에서 멀찍이 떨어져 있다', () => {
        const { sink, reporter } = build();

        reporter.report('boot', 1099, {
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
        expect(JSON.stringify(sink.emitted[0]).length).toBeLessThan(600);
    });
});

describe('NOOP_PERF_METRIC_REPORTER', () => {
    it('아무것도 하지 않고, 호출자는 그 사실을 몰라도 된다', () => {
        expect(() => NOOP_PERF_METRIC_REPORTER.report('boot', 1099, { bootType: 'cold' })).not.toThrow();
    });

    it('얼어 있어 누가 바꿔칠 수 없다', () => {
        expect(Object.isFrozen(NOOP_PERF_METRIC_REPORTER)).toBe(true);
    });
});
