import { LogPerfTraceBackend, PERF_LOG_TAG } from './LogPerfTraceBackend';

import type { Logger } from '@chatic/logger';
import type { PerfTraceResult } from '../types';

const createLogger = () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });

const result: PerfTraceResult = {
    id: 't-1',
    name: 'chat_room_open',
    durationMs: 1_234,
    attributes: { entry: 'list' },
    metrics: { mount: 80 },
};

describe('LogPerfTraceBackend', () => {
    it('writes a sampled run’s finished trace as one info/PERF entry with the numbers in data', () => {
        const logger = createLogger();
        const backend = new LogPerfTraceBackend({
            logger: logger as unknown as Logger,
            runId: 'run-1',
            samplePercent: 100,
        });

        backend.start();
        backend.stop(result);

        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(PERF_LOG_TAG, 'chat_room_open 1234ms', {
            trace: 'chat_room_open',
            ms: 1_234,
            attributes: { entry: 'list' },
            metrics: { mount: 80 },
        });
    });

    it('writes nothing for a run outside the sample', () => {
        const logger = createLogger();
        const backend = new LogPerfTraceBackend({
            logger: logger as unknown as Logger,
            runId: 'run-1',
            samplePercent: 0,
        });

        backend.stop(result);

        expect(logger.info).not.toHaveBeenCalled();
    });

    it('writes nothing without a run id, since the entry could not be grouped with its session', () => {
        const logger = createLogger();
        const backend = new LogPerfTraceBackend({
            logger: logger as unknown as Logger,
            runId: undefined,
            samplePercent: 100,
        });

        backend.stop(result);

        expect(logger.info).not.toHaveBeenCalled();
    });
});
