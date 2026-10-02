/**
 * `lib/cloud-deployments/runDeploys.spec.ts`
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { abortableDelay, runDeploys, type DeployResult } from './runDeploys';

import type { DeployCall } from './deployPlan';

const call = (productId: string): DeployCall => ({
    productId,
    projectId: `project-${productId}`,
    service: 'backend',
    force: true,
    params: { force: 1 },
});

const CALLS = ['a', 'b', 'c'].map(call);

/** Records every call and wait in one timeline, so their order can be asserted. */
const recorder = () => {
    const timeline: string[] = [];
    const wait = vi.fn(async (ms: number) => {
        timeline.push(`wait ${ms}`);
    });
    return { timeline, wait };
};

describe('runDeploys', () => {
    it('calls one at a time in order, waiting between calls but not before the first', async () => {
        const { timeline, wait } = recorder();
        const deploy = vi.fn(async (next: DeployCall) => {
            timeline.push(`deploy ${next.productId}`);
            return 'status: busy';
        });

        const { results, summary } = await runDeploys({
            calls: CALLS,
            deploy,
            wait,
            signal: new AbortController().signal,
        });

        expect(timeline).toEqual(['deploy a', 'wait 1500', 'deploy b', 'wait 1500', 'deploy c']);
        expect(results.map(result => [result.call.productId, result.ok, result.message])).toEqual([
            ['a', true, 'status: busy'],
            ['b', true, 'status: busy'],
            ['c', true, 'status: busy'],
        ]);
        expect(summary).toEqual({ succeeded: 3, failed: 0, notStarted: 0 });
    });

    it('records a failed call and carries on with the next one', async () => {
        const { wait } = recorder();
        const deploy = vi.fn(async (next: DeployCall) => {
            if (next.productId === 'b') throw new Error('product is busy');
            return 'ok';
        });
        const seen: DeployResult[] = [];

        const { summary } = await runDeploys({
            calls: CALLS,
            deploy,
            wait,
            signal: new AbortController().signal,
            onResult: result => seen.push(result),
        });

        expect(deploy).toHaveBeenCalledTimes(3);
        expect(seen.map(result => [result.call.productId, result.ok, result.message])).toEqual([
            ['a', true, 'ok'],
            ['b', false, 'product is busy'],
            ['c', true, 'ok'],
        ]);
        expect(summary).toEqual({ succeeded: 2, failed: 1, notStarted: 0 });
    });

    it('starts no new call once stopped, but lets the call in flight finish', async () => {
        const controller = new AbortController();
        const { wait } = recorder();
        const deploy = vi.fn(async (next: DeployCall) => {
            // Stop pressed while the first call is still out.
            if (next.productId === 'a') controller.abort();
            return 'ok';
        });

        const { results, summary } = await runDeploys({ calls: CALLS, deploy, wait, signal: controller.signal });

        expect(deploy).toHaveBeenCalledTimes(1);
        // Nothing is left to pace, so the pause is skipped too.
        expect(wait).not.toHaveBeenCalled();
        expect(results.map(result => result.ok)).toEqual([true]);
        expect(summary).toEqual({ succeeded: 1, failed: 0, notStarted: 2 });
    });

    it('starts no new call when stopped during the pause', async () => {
        const controller = new AbortController();
        const wait = vi.fn(async () => {
            controller.abort();
        });
        const deploy = vi.fn(async () => 'ok');

        const { summary } = await runDeploys({ calls: CALLS, deploy, wait, signal: controller.signal });

        expect(deploy).toHaveBeenCalledTimes(1);
        expect(summary.notStarted).toBe(2);
    });

    it('starts nothing when already stopped', async () => {
        const controller = new AbortController();
        controller.abort();
        const deploy = vi.fn(async () => 'ok');

        const { summary } = await runDeploys({ calls: CALLS, deploy, wait: vi.fn(), signal: controller.signal });

        expect(deploy).not.toHaveBeenCalled();
        expect(summary).toEqual({ succeeded: 0, failed: 0, notStarted: 3 });
    });
});

describe('abortableDelay', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('resolves after the given time', async () => {
        vi.useFakeTimers();
        const done = vi.fn();
        void abortableDelay(1500, new AbortController().signal).then(done);

        await vi.advanceTimersByTimeAsync(1499);
        expect(done).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(done).toHaveBeenCalled();
    });

    it('resolves early once stopped', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const done = vi.fn();
        void abortableDelay(1500, controller.signal).then(done);

        controller.abort();
        await vi.advanceTimersByTimeAsync(0);
        expect(done).toHaveBeenCalled();
    });
});
