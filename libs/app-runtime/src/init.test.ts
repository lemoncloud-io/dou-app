import type { RuntimeEngine } from '@chatic/runtime-core';

import { logger } from '@chatic/logger';

import { initAppRuntime, resetRuntimeEngine, runtimeEngine } from './init';

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const engine = { sessionController: jest.fn() } as unknown as RuntimeEngine;

afterEach(() => {
    resetRuntimeEngine();
    jest.clearAllMocks();
});

describe('initAppRuntime', () => {
    it('throws when the engine is read before the entry point handed one over', () => {
        expect(() => runtimeEngine()).toThrow(/initAppRuntime/);
    });

    it('hands the surface the engine it was given, and a later call replaces it', () => {
        initAppRuntime(engine);
        expect(runtimeEngine()).toBe(engine);

        const next = { ...engine } as RuntimeEngine;
        initAppRuntime(next);
        expect(runtimeEngine()).toBe(next);
    });

    it('warns when a different engine replaces the one already handed over, and not for the same one', () => {
        initAppRuntime(engine);
        initAppRuntime(engine);
        expect(logger.warn).not.toHaveBeenCalled();

        initAppRuntime({ ...engine } as RuntimeEngine);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
