import { resetPerfTraces, startPerfTrace } from '@chatic/perf';

import { appBridge } from '../../bridge/appBridge';
import { configureWebPerfTraces, supportsNativePerfTraces } from './webPerfTraces';

import type { Logger } from '@chatic/logger';
import type { OnWebAppReadyPayload } from '@chatic/app-messages';

jest.mock('../../bridge/appBridge', () => ({
    appBridge: { startPerfTrace: jest.fn(), stopPerfTrace: jest.fn() },
}));

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;

const reportWith = (supportedWebMessages: string[]): OnWebAppReadyPayload =>
    ({ appVersion: '1.0.0', protocolVersion: '1', supportedWebMessages, supportedAppMessages: [] }) as never;

beforeEach(() => jest.clearAllMocks());
afterEach(() => resetPerfTraces());

describe('supportsNativePerfTraces', () => {
    it('needs both the start and the stop handler', () => {
        expect(supportsNativePerfTraces(reportWith(['StartPerfTrace', 'StopPerfTrace']))).toBe(true);
        expect(supportsNativePerfTraces(reportWith(['StartPerfTrace']))).toBe(false);
        expect(supportsNativePerfTraces(reportWith([]))).toBe(false);
        expect(supportsNativePerfTraces(null)).toBe(false);
    });
});

describe('configureWebPerfTraces', () => {
    it('holds traces started before the report, then sends them over the bridge when the app supports it', () => {
        const perf = configureWebPerfTraces({ logger, runId: 'run-1' });

        const trace = startPerfTrace('web_vitals');
        trace.stop();
        expect(appBridge.startPerfTrace).not.toHaveBeenCalled();

        perf.resolveWith(reportWith(['StartPerfTrace', 'StopPerfTrace']));

        expect(appBridge.startPerfTrace).toHaveBeenCalledWith({ id: trace.id, name: 'web_vitals' });
        expect(appBridge.stopPerfTrace).toHaveBeenCalledWith(
            expect.objectContaining({ id: trace.id, name: 'web_vitals', attributes: {}, metrics: {} })
        );
    });

    it('falls back to the log pipeline on an app build without the handlers', () => {
        // A run id is needed for the log backend to sample at all; whether this one lands in the
        // sample is not what is being asserted — only that nothing crosses the bridge.
        const perf = configureWebPerfTraces({ logger, runId: 'run-1' });
        perf.resolveWith(reportWith(['WebAppReady']));

        startPerfTrace('site_switch').stop();

        expect(appBridge.startPerfTrace).not.toHaveBeenCalled();
        expect(appBridge.stopPerfTrace).not.toHaveBeenCalled();
    });

    it('records nothing in a plain browser tab, which has no report and no run id', () => {
        const perf = configureWebPerfTraces({ logger, runId: undefined });
        perf.resolveWith(null);

        startPerfTrace('site_switch').stop();

        expect(appBridge.stopPerfTrace).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
    });
});
