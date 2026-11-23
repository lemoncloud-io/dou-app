import {
    TelemetryRecorder,
    TelemetrySampler,
    createLogId,
    ingestLogEntry,
    setTelemetryRecorder,
} from '@chatic/bridges';
import { runtime } from '@chatic/runtime';

import { getLongTaskStats } from '../../features/debug/metrics/longTasks';
import { setPerfTelemetryRecorder } from '../perf';
import { WEB_TELEMETRY_CATALOG } from './catalog';
import { builtInTelemetryPolicySource, loadStartingPolicy, refreshPolicy } from './policy';
import { createScreenViewTracker } from './screenViews';
import { TelemetrySession } from './session';

import type { LogContextProvider, LogEntry, TelemetryRejection } from '@chatic/bridges';
import type { TelemetryPolicySource } from './policy';

const POLICY_REFRESH_MS = 60_000;

const DROP_REPORT_MS = 60_000;

export interface StartTelemetryOptions {
    context: LogContextProvider;
    source?: TelemetryPolicySource;
    allowPolicyOverride?: boolean;
    onReject?: (rejection: TelemetryRejection) => void;
    now?: () => number;
}

interface ActiveTelemetry {
    sampler: TelemetrySampler;
    recorder: TelemetryRecorder;
    session: TelemetrySession;
    tracker: ReturnType<typeof createScreenViewTracker>;
}

let active: ActiveTelemetry | undefined;
const sessionStartListeners = new Set<() => void>();
let pendingDrops = 0;
let dropTimer: ReturnType<typeof setTimeout> | undefined;

export const startTelemetry = (options: StartTelemetryOptions): (() => void) => {
    const now = options.now ?? Date.now;
    const allowOverride = options.allowPolicyOverride ?? false;
    const source = options.source ?? builtInTelemetryPolicySource;

    const sampler = new TelemetrySampler({
        policy: loadStartingPolicy(now(), allowOverride),
        runId: safeContext(options.context).runId,
        now,
    });
    const recorder = new TelemetryRecorder({
        publish: ingestLogEntry,
        context: options.context,
        sampler,
        catalog: WEB_TELEMETRY_CATALOG,
        now,
        onReject: options.onReject,
    });
    const session = new TelemetrySession({
        now,
        createId: createLogId,
        entry: runtime.diagnostics.entry,
        recordEvent: (name, fields) => recorder.event(name, fields),
        onNewSession: () => {
            tracker.restart();
            sessionStartListeners.forEach(listener => {
                try {
                    listener();
                } catch {
                    // One listener's failure must not keep the others, or the session, from going on.
                }
            });
        },
    });
    const tracker = createScreenViewTracker({
        now,
        recordEvent: (name, fields) => recorder.event(name, fields),
        recordSample: (name, fields) => recorder.sample(name, fields),
        longTasks: getLongTaskStats,
        onScreen: () => session.countScreen(),
    });

    active = { sampler, recorder, session, tracker };
    setPerfTelemetryRecorder(recorder);
    setTelemetryRecorder(recorder);
    session.begin();

    const onVisibility = (): void => {
        if (document.visibilityState === 'hidden') {
            tracker.flush();
            session.hidden();
        } else {
            session.visible();
        }
    };
    window.addEventListener('visibilitychange', onVisibility, true);

    const refresh = (): void => {
        if (document.visibilityState === 'hidden') return;
        void refreshPolicy(source, now, allowOverride).then(policy => {
            if (policy && active?.sampler === sampler) sampler.updateSwitches(policy);
        });
    };
    refresh();
    const refreshTimer = setInterval(refresh, POLICY_REFRESH_MS);

    return () => {
        clearInterval(refreshTimer);
        window.removeEventListener('visibilitychange', onVisibility, true);
        if (dropTimer !== undefined) {
            clearTimeout(dropTimer);
            dropTimer = undefined;
        }
        pendingDrops = 0;
        if (active?.sampler === sampler) {
            active = undefined;
            setPerfTelemetryRecorder(undefined);
            setTelemetryRecorder(undefined);
        }
    };
};

const safeContext = (provider: LogContextProvider) => {
    try {
        return provider() ?? {};
    } catch {
        return {};
    }
};

export const onUsageSessionStart = (listener: () => void): (() => void) => {
    sessionStartListeners.add(listener);
    return () => {
        sessionStartListeners.delete(listener);
    };
};

export const currentTelemetrySessionId = (): string | undefined => active?.session.id;

export const selectTelemetryForUpload = (entries: LogEntry[]): LogEntry[] =>
    active ? active.sampler.selectForUpload(entries) : [];

export const noteStatisticsDropped = (dropped: readonly LogEntry[]): void => {
    const count = dropped.filter(entry => entry.tag !== 'perf.telemetry_dropped').length;
    if (count <= 0) return;
    pendingDrops += count;
    if (dropTimer !== undefined) return;
    dropTimer = setTimeout(() => {
        dropTimer = undefined;
        const dropped = pendingDrops;
        pendingDrops = 0;
        active?.recorder.sample('telemetry_dropped', { metrics: { count: dropped } });
    }, DROP_REPORT_MS);
};

export interface ScreenRouter {
    state: { location: { pathname: string } };
    subscribe(listener: (state: { location: { pathname: string } }) => void): () => void;
}

export const observeScreenViews = (router: ScreenRouter): (() => void) => {
    active?.tracker.onPath(router.state.location.pathname);
    return router.subscribe(state => active?.tracker.onPath(state.location.pathname));
};
