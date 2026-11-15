import { clearActivePerfTrace, createPerfTrace, setActivePerfTrace } from '@chatic/perf';
import type { PerfTraceBackend, PerfTraceResult } from '@chatic/perf';

import { markPrimeAsked, traceRoomFetch } from './roomTrace';

const activeRoomTrace = (channelId: string) => {
    const results: PerfTraceResult[] = [];
    const backend: PerfTraceBackend = { start: () => undefined, stop: result => results.push(result) };
    const trace = createPerfTrace({ backend, id: 't1', name: 'chat_room_sync', elapsed: () => 0, announce: false });
    setActivePerfTrace('chat_room_sync', channelId, trace);
    return { trace, results };
};

afterEach(() => clearActivePerfTrace('chat_room_sync'));

describe('the mirrored room trace', () => {
    it("marks the prime's entry and says the session's owner", () => {
        const { trace } = activeRoomTrace('ch1');
        markPrimeAsked('ch1');
        expect(trace.hasMetric('verified')).toBe(true);
        trace.stop();
    });

    it('takes the trace for the first fetch, and ends it when nothing was written', async () => {
        const { trace, results } = activeRoomTrace('ch1');
        const result = Promise.resolve({ fetchedCount: 0, latestNo: 7 } as never);
        traceRoomFetch('ch1', result);
        expect(trace.hasMetric('feed_sent')).toBe(true);
        await result;
        await Promise.resolve();

        expect(results).toEqual([
            expect.objectContaining({
                attributes: expect.objectContaining({ session_owner: 'native', outcome: 'synced' }),
                metrics: expect.objectContaining({ fetched: 0, latest_no: 7 }),
            }),
        ]);
        expect(results[0].metrics).toHaveProperty('feed_done');
        expect(results[0].metrics).not.toHaveProperty('feed_received');
    });

    it('leaves the trace running when the fetch wrote a page, for the room to end', async () => {
        const { trace, results } = activeRoomTrace('ch1');
        const result = Promise.resolve({ fetchedCount: 20, latestNo: 40 } as never);
        traceRoomFetch('ch1', result);
        await result;
        await Promise.resolve();
        expect(results).toEqual([]);
        expect(trace.hasMetric('feed_done')).toBe(true);
        trace.stop();
    });

    it('does not take a trace another fetch already took, and ends a failed one as an error', async () => {
        const { trace, results } = activeRoomTrace('ch1');
        const failed = Promise.reject(new Error('gone'));
        traceRoomFetch('ch1', failed);
        traceRoomFetch('ch1', Promise.resolve({ fetchedCount: 0, latestNo: 1 } as never));
        await failed.catch(() => undefined);
        await Promise.resolve();
        await Promise.resolve();
        expect(results).toEqual([
            expect.objectContaining({ attributes: expect.objectContaining({ outcome: 'error' }) }),
        ]);
        expect(trace.getMetric('fetched')).toBeUndefined();
    });

    it('ends the trace as an error when the fetch answered nothing (a prefetch that failed)', async () => {
        const { trace, results } = activeRoomTrace('ch1');
        traceRoomFetch('ch1', Promise.resolve(null));
        await Promise.resolve();
        await Promise.resolve();
        expect(results).toEqual([
            expect.objectContaining({ attributes: expect.objectContaining({ outcome: 'error' }) }),
        ]);
        expect(trace.hasMetric('feed_done')).toBe(false);
    });
});
