import { hashRunId, isSampledRun } from '@chatic/perf';

import type { runtime } from '@chatic/app-runtime';

import {
    isSocketRequestSampledRun,
    observeSocketRequests,
    SOCKET_REQUEST_SAMPLES_PER_MINUTE,
    SOCKET_REQUEST_SAMPLES_PER_TYPE_PER_MINUTE,
    SOCKET_REQUEST_SAMPLES_WHILE_HELD,
} from './socketRequestTrace';

/** A run id whose hash falls in `[from, to)` of the hundred buckets, found against the real hash. */
const runInBucket = (from: number, to: number): string => {
    for (let i = 0; i < 10_000; i += 1) {
        const id = `run-${i}`;
        const bucket = hashRunId(id) % 100;
        if (bucket >= from && bucket < to) return id;
    }
    throw new Error('no run id found');
};

const SAMPLED_RUN = runInBucket(10, 20);
const BRIDGE_RUN = runInBucket(0, 10);
const UNSAMPLED_RUN = runInBucket(20, 100);

const sample = (
    overrides: Partial<runtime.connection.SocketRequestSample> = {}
): runtime.connection.SocketRequestSample => ({
    type: 'chat.send',
    kind: 'relay',
    outcome: 'ok',
    roundTripMs: 140,
    ...overrides,
});

const setup = (runId: string | undefined, options: { hidden?: boolean; held?: () => boolean } = {}) => {
    let observer: ((sample: runtime.connection.SocketRequestSample) => void) | undefined;
    const manager = {
        setRequestObserver: jest.fn((next?: (s: runtime.connection.SocketRequestSample) => void) => (observer = next)),
    };
    const record = jest.fn();
    let clock = 0;
    const stop = observeSocketRequests({
        manager,
        runId,
        record,
        now: () => clock,
        isHidden: () => options.hidden ?? false,
        isHeld: options.held,
    });
    return {
        manager,
        record,
        stop,
        emit: (value: runtime.connection.SocketRequestSample = sample()) => observer?.(value),
        advance: (ms: number) => (clock += ms),
    };
};

describe('observeSocketRequests', () => {
    it('samples a different tenth of runs from bridge_request', () => {
        expect(isSocketRequestSampledRun(SAMPLED_RUN)).toBe(true);
        expect(isSampledRun(SAMPLED_RUN)).toBe(false);
        expect(isSocketRequestSampledRun(BRIDGE_RUN)).toBe(false);
        expect(isSocketRequestSampledRun(UNSAMPLED_RUN)).toBe(false);
        expect(isSocketRequestSampledRun(undefined)).toBe(false);
    });

    it('records a request as a socket_request sample, broken down by type, kind and outcome', () => {
        const { record, emit } = setup(SAMPLED_RUN);

        emit(sample({ type: 'chat.feed', kind: 'cloud', outcome: '408', roundTripMs: 30_000 }));

        expect(record).toHaveBeenCalledWith('socket_request', {
            attributes: { type: 'chat.feed', kind: 'cloud', outcome: '408' },
            metrics: { rtt_ms: 30_000 },
        });
    });

    it('attaches nothing in a run it does not sample', () => {
        expect(setup(UNSAMPLED_RUN).manager.setRequestObserver).not.toHaveBeenCalled();
        expect(setup(BRIDGE_RUN).manager.setRequestObserver).not.toHaveBeenCalled();
    });

    it('keeps a few of each type a minute, so a frequent type cannot use the whole budget', () => {
        const { record, emit, advance } = setup(SAMPLED_RUN);

        for (let i = 0; i < SOCKET_REQUEST_SAMPLES_PER_TYPE_PER_MINUTE + 5; i += 1) emit(sample({ type: 'chat.feed' }));
        emit(sample({ type: 'chat.send' }));

        const types = () => record.mock.calls.map(([, recorded]) => recorded.attributes.type);
        expect(types()).toEqual([...Array(SOCKET_REQUEST_SAMPLES_PER_TYPE_PER_MINUTE).fill('chat.feed'), 'chat.send']);

        advance(60_000);
        emit(sample({ type: 'chat.feed' }));
        expect(types().at(-1)).toBe('chat.feed');
    });

    it('keeps to the per-minute total across types', () => {
        const { record, emit } = setup(SAMPLED_RUN);

        for (let i = 0; i < SOCKET_REQUEST_SAMPLES_PER_MINUTE + 5; i += 1) emit(sample({ type: `type.${i}` }));

        expect(record).toHaveBeenCalledTimes(SOCKET_REQUEST_SAMPLES_PER_MINUTE);
    });

    it('keeps only a few while traces are held for the report', () => {
        let held = true;
        const { record, emit } = setup(SAMPLED_RUN, { held: () => held });

        for (let i = 0; i < SOCKET_REQUEST_SAMPLES_WHILE_HELD + 3; i += 1) emit(sample({ type: `type.${i}` }));
        expect(record).toHaveBeenCalledTimes(SOCKET_REQUEST_SAMPLES_WHILE_HELD);

        held = false;
        emit(sample({ type: 'type.after' }));
        expect(record).toHaveBeenCalledTimes(SOCKET_REQUEST_SAMPLES_WHILE_HELD + 1);
    });

    it('records nothing while the page is hidden, and detaches when stopped', () => {
        const hidden = setup(SAMPLED_RUN, { hidden: true });
        hidden.emit();
        expect(hidden.record).not.toHaveBeenCalled();

        const { manager, stop } = setup(SAMPLED_RUN);
        stop();
        expect(manager.setRequestObserver).toHaveBeenLastCalledWith(undefined);
    });
});
