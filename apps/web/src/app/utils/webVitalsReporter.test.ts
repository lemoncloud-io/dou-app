import { configurePerfTraces, resetPerfTraces } from '@chatic/perf';

import { getVitals } from './webVitalsStore';
import { receiveVital } from './webVitalsReporter';

import type { PerfTraceBackend } from '@chatic/perf';
import type { Metric } from 'web-vitals';

const backend = { start: jest.fn(), stop: jest.fn() } satisfies PerfTraceBackend;

const vital = (name: Metric['name'], value: number): Metric => ({ name, value, rating: 'good' }) as unknown as Metric;

describe('receiveVital', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetPerfTraces();
    });

    afterEach(() => resetPerfTraces());

    it('예산이 없는 지표도 오버레이 스토어에는 전부 들어간다', () => {
        configurePerfTraces(backend);

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

    it('records nothing for INP, CLS or TTFB', () => {
        configurePerfTraces(backend);

        receiveVital(vital('INP', 180));
        receiveVital(vital('CLS', 0.05));
        receiveVital(vital('TTFB', 320));

        expect(backend.stop).not.toHaveBeenCalled();
    });

    it('records FCP and LCP as web_vitals samples, the value carried in value_ms', () => {
        configurePerfTraces(backend);

        receiveVital(vital('FCP', 1_650));
        receiveVital(vital('LCP', 2_800.4));

        expect(backend.stop).toHaveBeenCalledTimes(2);
        expect(backend.stop).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ name: 'web_vitals', attributes: { vital: 'fcp' }, metrics: { value_ms: 1650 } })
        );
        expect(backend.stop).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ name: 'web_vitals', attributes: { vital: 'lcp' }, metrics: { value_ms: 2800 } })
        );
    });

    it('fills the overlay store but records nothing on a host that never configured tracing', () => {
        receiveVital(vital('LCP', 2_800));

        expect(getVitals().LCP).toEqual({ value: 2800, rating: 'good' });
        expect(backend.stop).not.toHaveBeenCalled();
    });
});
