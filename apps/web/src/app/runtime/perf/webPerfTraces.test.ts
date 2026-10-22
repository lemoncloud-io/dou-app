import { recordPerfSample, resetPerfTraces, startPerfTrace } from '@chatic/perf';

import { appBridge } from '../../bridge/appBridge';
import { configureWebPerfTraces, setPerfTelemetryRecorder, supportsNativePerfTraces } from './webPerfTraces';

import type { Logger } from '@chatic/logger';
import type { OnWebAppReadyPayload } from '@chatic/app-messages';

jest.mock('../../bridge/appBridge', () => ({
    appBridge: { startPerfTrace: jest.fn(), stopPerfTrace: jest.fn() },
}));

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;

const reportWith = (supportedWebMessages: string[]): OnWebAppReadyPayload =>
    ({ appVersion: '1.0.0', protocolVersion: '1', supportedWebMessages, supportedAppMessages: [] }) as never;

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
    resetPerfTraces();
    setPerfTelemetryRecorder(undefined);
});

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

        const trace = startPerfTrace('site_switch');
        trace.stop();
        expect(appBridge.startPerfTrace).not.toHaveBeenCalled();

        perf.resolveWith(reportWith(['StartPerfTrace', 'StopPerfTrace']));

        expect(appBridge.startPerfTrace).toHaveBeenCalledWith({ id: trace.id, name: 'site_switch' });
        expect(appBridge.stopPerfTrace).toHaveBeenCalledWith(
            expect.objectContaining({ id: trace.id, name: 'site_switch', attributes: {}, metrics: {} })
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

    it('reports traces as held until the report arrives', () => {
        const perf = configureWebPerfTraces({ logger, runId: 'run-1' });
        expect(perf.isHeld()).toBe(true);

        perf.resolveWith(null);

        expect(perf.isHeld()).toBe(false);
    });

    it('records nothing in a plain browser tab, which has no report and no run id', () => {
        const perf = configureWebPerfTraces({ logger, runId: undefined });
        perf.resolveWith(null);

        startPerfTrace('site_switch').stop();

        expect(appBridge.stopPerfTrace).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
    });
});

describe('configureWebPerfTraces — the log pipeline branch', () => {
    const recorder = () => ({ record: jest.fn() });

    it('records on the pipeline beside Firebase when the app supports traces', () => {
        const pipeline = recorder();
        setPerfTelemetryRecorder(pipeline);
        const perf = configureWebPerfTraces();
        perf.resolveWith(reportWith(['StartPerfTrace', 'StopPerfTrace']));

        const trace = startPerfTrace('chat_room_open');
        trace.putAttribute('entry', 'list');
        trace.putAttribute('network', '4g');
        trace.stop();

        expect(appBridge.stopPerfTrace).toHaveBeenCalledWith(
            expect.objectContaining({ attributes: { entry: 'list' } })
        );
        expect(pipeline.record).toHaveBeenCalledWith(
            'trace',
            'chat_room_open',
            expect.objectContaining({ attrs: { entry: 'list', network: '4g' } })
        );
    });

    it('records on the pipeline alone on an app without the handlers, and in a plain tab', () => {
        const pipeline = recorder();
        setPerfTelemetryRecorder(pipeline);
        configureWebPerfTraces().resolveWith(reportWith(['WebAppReady']));
        startPerfTrace('site_switch').stop();
        resetPerfTraces();
        configureWebPerfTraces().resolveWith(null);
        startPerfTrace('site_switch').stop();

        expect(appBridge.stopPerfTrace).not.toHaveBeenCalled();
        expect(pipeline.record).toHaveBeenCalledTimes(2);
    });

    it('never sends a pipeline-only trace over the bridge', () => {
        const pipeline = recorder();
        setPerfTelemetryRecorder(pipeline);
        configureWebPerfTraces().resolveWith(reportWith(['StartPerfTrace', 'StopPerfTrace']));

        startPerfTrace('long_tasks').stop();

        expect(appBridge.startPerfTrace).not.toHaveBeenCalled();
        expect(appBridge.stopPerfTrace).not.toHaveBeenCalled();
        expect(pipeline.record).toHaveBeenCalledWith('trace', 'long_tasks', expect.anything());
    });
});

describe('configureWebPerfTraces — boot-time web vitals', () => {
    it('sends an LCP sample taken before the report over the bridge, start then stop', () => {
        const perf = configureWebPerfTraces();
        recordPerfSample('web_vitals', { attributes: { vital: 'lcp' }, metrics: { value_ms: 1_200 } });
        expect(appBridge.startPerfTrace).not.toHaveBeenCalled();

        perf.resolveWith(reportWith(['StartPerfTrace', 'StopPerfTrace']));

        const startOrder = (appBridge.startPerfTrace as jest.Mock).mock.invocationCallOrder[0];
        const stopOrder = (appBridge.stopPerfTrace as jest.Mock).mock.invocationCallOrder[0];
        expect(startOrder).toBeLessThan(stopOrder);
        expect(appBridge.stopPerfTrace).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'web_vitals', attributes: { vital: 'lcp' }, metrics: { value_ms: 1_200 } })
        );
    });

    it('keeps an INP sample off the bridge and records it on the pipeline', () => {
        const pipeline = { record: jest.fn() };
        setPerfTelemetryRecorder(pipeline);
        const perf = configureWebPerfTraces();
        recordPerfSample('web_vitals', { attributes: { vital: 'inp' }, metrics: { value_ms: 80 } });
        perf.resolveWith(reportWith(['StartPerfTrace', 'StopPerfTrace']));

        expect(appBridge.startPerfTrace).not.toHaveBeenCalled();
        expect(appBridge.stopPerfTrace).not.toHaveBeenCalled();
        expect(pipeline.record).toHaveBeenCalledWith(
            'sample',
            'web_vitals',
            expect.objectContaining({ attrs: { vital: 'inp' } })
        );
    });
});
