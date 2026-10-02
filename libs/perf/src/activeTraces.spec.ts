import {
    clearActivePerfTrace,
    endActivePerfTrace,
    endPerfTrace,
    getActivePerfTrace,
    setActivePerfTrace,
} from './activeTraces';
import { createPerfTrace, NOOP_PERF_TRACE_BACKEND } from './PerfTrace';

const traceFor = (id: string, backend = NOOP_PERF_TRACE_BACKEND) =>
    createPerfTrace({ backend, id, name: 'chat_room_sync', elapsed: () => 0, announce: false });

afterEach(() => clearActivePerfTrace('chat_room_sync'));

describe('active perf traces', () => {
    it('returns the active trace only for the subject it is about', () => {
        const trace = traceFor('a');
        setActivePerfTrace('chat_room_sync', 'ch_1', trace);

        expect(getActivePerfTrace('chat_room_sync', 'ch_1')).toBe(trace);
        expect(getActivePerfTrace('chat_room_sync', 'ch_2')).toBeUndefined();
    });

    it('keeps one per name, the latest replacing the earlier', () => {
        setActivePerfTrace('chat_room_sync', 'ch_1', traceFor('a'));
        const newer = traceFor('b');
        setActivePerfTrace('chat_room_sync', 'ch_2', newer);

        expect(getActivePerfTrace('chat_room_sync', 'ch_1')).toBeUndefined();
        expect(getActivePerfTrace('chat_room_sync', 'ch_2')).toBe(newer);
    });

    it('does not let an older trace clear the newer one that replaced it', () => {
        const older = traceFor('a');
        setActivePerfTrace('chat_room_sync', 'ch_1', older);
        const newer = traceFor('b');
        setActivePerfTrace('chat_room_sync', 'ch_1', newer);

        clearActivePerfTrace('chat_room_sync', older);

        expect(getActivePerfTrace('chat_room_sync', 'ch_1')).toBe(newer);
    });

    it('ends the active trace with an outcome and frees the slot, for its subject only', () => {
        const backend = { start: jest.fn(), stop: jest.fn() };
        setActivePerfTrace('chat_room_sync', 'ch_1', traceFor('a', backend));

        endActivePerfTrace('chat_room_sync', 'ch_2', 'synced');
        expect(backend.stop).not.toHaveBeenCalled();

        endActivePerfTrace('chat_room_sync', 'ch_1', 'synced');
        expect(backend.stop).toHaveBeenCalledWith(expect.objectContaining({ attributes: { outcome: 'synced' } }));
        expect(getActivePerfTrace('chat_room_sync', 'ch_1')).toBeUndefined();
    });

    it('ends the trace it is handed, leaving a newer one in the slot running', () => {
        const backend = { start: jest.fn(), stop: jest.fn() };
        const older = traceFor('a', backend);
        setActivePerfTrace('chat_room_sync', 'ch_1', older);
        const newer = traceFor('b', backend);
        setActivePerfTrace('chat_room_sync', 'ch_1', newer);

        endPerfTrace('chat_room_sync', older, 'error');

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'a', attributes: { outcome: 'error' } })
        );
        expect(getActivePerfTrace('chat_room_sync', 'ch_1')).toBe(newer);
    });

    it('does not rewrite the outcome of a trace that already ended', () => {
        const backend = { start: jest.fn(), stop: jest.fn() };
        const trace = traceFor('a', backend);
        setActivePerfTrace('chat_room_sync', 'ch_1', trace);
        endActivePerfTrace('chat_room_sync', 'ch_1', 'synced');

        endPerfTrace('chat_room_sync', trace, 'error');

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop).toHaveBeenCalledWith(expect.objectContaining({ attributes: { outcome: 'synced' } }));
    });
});
