import {
    DeferredPerfTraceBackend,
    FanOutPerfTraceBackend,
    FirebaseDimensionsPerfTraceBackend,
    PipelinePerfTraceBackend,
    SESSION_OWNER_ATTRIBUTE,
    configurePerfTraces,
} from '@chatic/perf';

import { appBridge } from '../../bridge/appBridge';
import { isBelowAppVersionFloor, readShellVersion } from '../../features/appUpdate/lib/appVersionFloor';
import { readLaunchSessionOwner } from '../launchSessionOwner';

import type { OnWebAppReadyPayload } from '@chatic/bridge-messages';
import type { Logger } from '@chatic/logger';
import type { PerfTelemetryRecorder, PerfTraceBackend } from '@chatic/perf';

export const bridgePerfTraceBackend: PerfTraceBackend = {
    start: ({ id, name }) => appBridge.startPerfTrace({ id, name }),
    stop: ({ id, name, attributes, metrics }) => appBridge.stopPerfTrace({ id, name, attributes, metrics }),
};

let pipelineRecorder: PerfTelemetryRecorder | undefined;

export const setPerfTelemetryRecorder = (recorder: PerfTelemetryRecorder | undefined): void => {
    pipelineRecorder = recorder;
};

export const pipelinePerfTraceBackend: PerfTraceBackend = new PipelinePerfTraceBackend(
    () => pipelineRecorder,
    () => ({ [SESSION_OWNER_ATTRIBUTE]: readLaunchSessionOwner() })
);

export const configureWebPerfTraces = (_options: { logger?: Logger; runId?: string } = {}) => {
    const deferred = new DeferredPerfTraceBackend();
    configurePerfTraces(deferred);
    let resolved = false;

    return {
        isHeld: (): boolean => !resolved,
        resolveWith(report: OnWebAppReadyPayload | null): void {
            resolved = true;
            const traced = report && !isBelowAppVersionFloor(readShellVersion());
            deferred.resolve(
                traced
                    ? new FanOutPerfTraceBackend([
                          new FirebaseDimensionsPerfTraceBackend(bridgePerfTraceBackend),
                          pipelinePerfTraceBackend,
                      ])
                    : pipelinePerfTraceBackend
            );
        },
    };
};
