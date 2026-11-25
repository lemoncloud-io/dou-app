import { createLogId, liveShellGlobals, liveShellValue, logger, setLogContextProvider } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';

import { getRouteTrail } from '../../utils/routeTrail';
import { readLaunchSessionOwner } from '../launchSessionOwner';
import { currentTelemetrySessionId } from '../telemetry/telemetryRuntime';
import { routeTemplateOf } from '../telemetry/routeTemplate';
import { diagnosticsKind } from '../../../config/diagnosticsKind';

import type { LogContext, ShellGlobals } from '@chatic/bridges';

declare const __APP_VERSION__: string;
const WEB_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined;

let webRunId: string | undefined;

export const readInjectedRunId = (): string | undefined => liveShellValue('CHATIC_APP_RUN_ID') as string | undefined;

const resolveRunId = (): string => {
    const injected = readInjectedRunId();
    if (injected) return injected;

    webRunId ??= createLogId();
    return webRunId;
};

const readNetwork = (): string | undefined =>
    (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;

const deviceContext = (globals: ShellGlobals): Pick<LogContext, 'platform' | 'host' | 'network' | 'locale'> => {
    const hybrid = diagnosticsKind() === 'shell';
    const injected = globals.CHATIC_APP_PLATFORM;
    return {
        platform: hybrid && (injected === 'ios' || injected === 'android') ? injected : 'web',
        host: hybrid ? 'app' : 'browser',
        network: readNetwork(),
        locale: document.documentElement.lang || navigator.language || undefined,
    };
};

export const readLogContext = (): LogContext => {
    const globals = liveShellGlobals();
    const trail = getRouteTrail();
    const route = trail.at(-1);

    let uid: string | undefined;
    let cid: string | undefined;
    let sid: string | undefined;

    try {
        const state = runtime.session.getGlobalSessionContext();
        uid = state.identity.userId ?? undefined;
        cid = state.cloud.cloudId ?? undefined;
        sid = state.cloud.siteId ?? undefined;
    } catch {
        // Logging must work before the session store is ready (boot, guest).
    }

    return {
        runId: resolveRunId(),
        uid,
        cid,
        sid,
        appVersion: globals.CHATIC_APP_CURRENT_VERSION,
        webVersion: WEB_VERSION,
        route,
        routeTemplate: routeTemplateOf(route),
        os: globals.CHATIC_APP_PLATFORM,
        osVersion: globals.CHATIC_APP_OS_VERSION,
        model: globals.CHATIC_APP_DEVICE_MODEL,
        sessionId: currentTelemetrySessionId(),
        sessionOwner: readLaunchSessionOwner(),
        ...deviceContext(globals),
    };
};

export const attachLogContext = (): (() => void) => {
    setLogContextProvider(readLogContext);
    return () => setLogContextProvider(undefined);
};

export const reportRunIdJoin = (): void => {
    if (diagnosticsKind() !== 'shell') return;
    if (readInjectedRunId()) return;

    logger.warn('APP', 'no native runId injected — native and web entries cannot be joined this run', {
        webRunId: resolveRunId(),
    });
};

export const resetWebRunId = (): void => {
    webRunId = undefined;
};
