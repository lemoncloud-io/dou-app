import { isSampledRun } from '@chatic/perf';

import {
    BRIDGE_REQUEST_SAMPLES_PER_MINUTE,
    BRIDGE_REQUEST_SAMPLES_WHILE_HELD,
    observeBridgeRequests,
    toPerfSample,
} from './bridgeRequestTrace';

import type { BridgeRequestObserver, BridgeRequestSample } from '@chatic/bridges';

// Picked against the real hash so the sampling decision is not mocked away.
const SAMPLED_RUN = 'run-8';
const UNSAMPLED_RUN = 'run-0';

const sample = (overrides: Partial<BridgeRequestSample> = {}): BridgeRequestSample => ({
    type: 'FetchBadgeCount',
    outcome: 'ok',
    queuedMs: 0,
    roundTripMs: 12,
    requestLength: 80,
    responseLength: 120,
    inFlightAtDispatch: 2,
    ...overrides,
});

const setup = (runId: string | undefined, options: { hidden?: boolean; held?: () => boolean } = {}) => {
    let observer: BridgeRequestObserver | undefined;
    const client = { setRequestObserver: jest.fn((next?: BridgeRequestObserver) => (observer = next)) };
    const record = jest.fn();
    let clock = 0;
    const stop = observeBridgeRequests({
        client,
        runId,
        record,
        now: () => clock,
        isHidden: () => options.hidden ?? false,
        isHeld: options.held,
    });
    return {
        client,
        record,
        stop,
        emit: (value: BridgeRequestSample = sample()) => observer?.(value),
        advance: (ms: number) => (clock += ms),
    };
};

describe('observeBridgeRequests', () => {
    it('uses run ids that really fall on each side of the sample', () => {
        expect(isSampledRun(SAMPLED_RUN)).toBe(true);
        expect(isSampledRun(UNSAMPLED_RUN)).toBe(false);
    });

    it('records each request of a sampled run as a bridge_request sample', () => {
        const { record, emit } = setup(SAMPLED_RUN);

        emit();

        expect(record).toHaveBeenCalledWith('bridge_request', toPerfSample(sample()));
    });

    it('attaches nothing in an unsampled run or without a run id', () => {
        expect(setup(UNSAMPLED_RUN).client.setRequestObserver).not.toHaveBeenCalled();
        expect(setup(undefined).client.setRequestObserver).not.toHaveBeenCalled();
    });

    it('keeps to the per-minute budget and starts a fresh one a minute later', () => {
        const { record, emit, advance } = setup(SAMPLED_RUN);

        for (let i = 0; i < BRIDGE_REQUEST_SAMPLES_PER_MINUTE + 5; i += 1) emit();
        expect(record).toHaveBeenCalledTimes(BRIDGE_REQUEST_SAMPLES_PER_MINUTE);

        advance(59_999);
        emit();
        expect(record).toHaveBeenCalledTimes(BRIDGE_REQUEST_SAMPLES_PER_MINUTE);

        advance(1);
        emit();
        expect(record).toHaveBeenCalledTimes(BRIDGE_REQUEST_SAMPLES_PER_MINUTE + 1);
    });

    it('keeps only a few samples while traces are held for the report, then the minute budget', () => {
        let held = true;
        const { record, emit } = setup(SAMPLED_RUN, { held: () => held });

        for (let i = 0; i < BRIDGE_REQUEST_SAMPLES_WHILE_HELD + 3; i += 1) emit();
        expect(record).toHaveBeenCalledTimes(BRIDGE_REQUEST_SAMPLES_WHILE_HELD);

        held = false;
        emit();
        expect(record).toHaveBeenCalledTimes(BRIDGE_REQUEST_SAMPLES_WHILE_HELD + 1);
    });

    it('records nothing while the page is hidden', () => {
        const { record, emit } = setup(SAMPLED_RUN, { hidden: true });

        emit();

        expect(record).not.toHaveBeenCalled();
    });

    it('detaches the observer when stopped', () => {
        const { client, stop } = setup(SAMPLED_RUN);

        stop();

        expect(client.setRequestObserver).toHaveBeenLastCalledWith(undefined);
    });
});

describe('toPerfSample', () => {
    it('maps the sample onto attributes and integer-ready metrics', () => {
        expect(toPerfSample(sample())).toEqual({
            attributes: { type: 'FetchBadgeCount', outcome: 'ok' },
            metrics: { rtt_ms: 12, queue_ms: 0, in_flight: 2, req_chars: 80, res_chars: 120 },
        });
    });

    it('leaves out a length the adapter did not report instead of sending zero', () => {
        const { metrics } = toPerfSample(sample({ requestLength: undefined, responseLength: undefined }));

        expect(metrics).not.toHaveProperty('req_chars');
        expect(metrics).not.toHaveProperty('res_chars');
    });

    it('leaves out a queue time that could not be measured', () => {
        expect(toPerfSample(sample({ queuedMs: undefined })).metrics).not.toHaveProperty('queue_ms');
    });
});
