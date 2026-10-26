import {
    TelemetryRecorder,
    TelemetrySampler,
    createLogId,
    ingestLogEntry,
    isNative,
    setTelemetryRecorder,
} from '@chatic/bridges';

import { getLongTaskStats } from '../../features/debug/metrics/longTasks';
import { setPerfTelemetryRecorder } from '../perf';
import { WEB_TELEMETRY_CATALOG } from './catalog';
import { builtInTelemetryPolicySource, loadStartingPolicy, refreshPolicy } from './policy';
import { createScreenViewTracker } from './screenViews';
import { TelemetrySession } from './session';

import type { LogContextProvider, LogEntry, TelemetryRejection } from '@chatic/bridges';
import type { TelemetryPolicySource } from './policy';

/** How often the kill switch and the debugging overrides are read again — the upload interval. */
const POLICY_REFRESH_MS = 60_000;

/** At most one `telemetry_dropped` sample this often. */
const DROP_REPORT_MS = 60_000;

export interface StartTelemetryOptions {
    /** The provider the logger reads too, so a statistic carries the same context as a log. */
    context: LogContextProvider;
    source?: TelemetryPolicySource;
    /** Honour the development policy override. Off in a production build. */
    allowPolicyOverride?: boolean;
    /** Told about catalogue refusals; a development build prints them. Must not call `logger`. */
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
let pendingDrops = 0;
let dropTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Starts statistics for this page: the run's sampling policy, the recorder every statistic goes
 * through, the usage session and the screen tracker. Call it once at boot, after the log context is
 * attached and before anything records — the boot-time vitals are decided with the policy read here.
 *
 * Everything recorded flows into the log hub like a log entry, and from there into the same queue.
 * With statistics off (the default policy, or a run on a build the policy excludes) nothing is
 * recorded at all.
 */
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
        entry: isNative() ? 'icon' : 'browser',
        recordEvent: (name, fields) => recorder.event(name, fields),
        // The tracker is declared below; this only runs on a later rollover.
        onNewSession: () => tracker.restart(),
    });
    const tracker = createScreenViewTracker({
        now,
        recordEvent: (name, fields) => recorder.event(name, fields),
        recordSample: (name, fields) => recorder.sample(name, fields),
        longTasks: getLongTaskStats,
        onScreen: () => session.countScreen(),
    });

    // Current before anything records, so the first event already carries this session's id.
    active = { sampler, recorder, session, tracker };
    setPerfTelemetryRecorder(recorder);
    // The same recorder for code that measures without owning one (the HTTP layer's api_request).
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
    // Captured on `window`, ahead of the uploader's listener on `document`: a hide closes the current
    // screen's long-task sample first, so the flush the uploader starts on the same hide carries it.
    window.addEventListener('visibilitychange', onVisibility, true);

    // Only the switches follow a fetch; the rest of the policy is fixed for this run, and a fetched
    // policy is saved for the next one. A failed fetch changes nothing — it is not "switched off".
    const refresh = (): void => {
        // Nothing to switch while nobody is using the page; the next visible tick catches up.
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

/** This page's usage session id, for the log context. Absent before telemetry starts. */
export const currentTelemetrySessionId = (): string | undefined => active?.session.id;

/**
 * The uploader's `selectTelemetry`: which statistics in a drawn batch are sent.
 *
 * Before telemetry starts there is no policy, which is the default policy — nothing is sent.
 */
export const selectTelemetryForUpload = (entries: LogEntry[]): LogEntry[] =>
    active ? active.sampler.selectForUpload(entries) : [];

/**
 * Notes statistics the queue dropped for room. Reported later, as one `telemetry_dropped` sample a
 * minute at most: this is called from inside the queue's push, which runs inside a hub publish, and
 * recording there would publish again from within the publish.
 */
export const noteStatisticsDropped = (dropped: readonly LogEntry[]): void => {
    // The report about drops is not itself counted: in a full share it would evict the next entry
    // and keep reporting itself, once a minute, for good.
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

/** The data router, as far as screen tracking needs it. */
export interface ScreenRouter {
    state: { location: { pathname: string } };
    subscribe(listener: (state: { location: { pathname: string } }) => void): () => void;
}

/**
 * Feeds route changes to the screen tracker. Mounted where the router is created; a change before
 * telemetry has started is ignored.
 */
export const observeScreenViews = (router: ScreenRouter): (() => void) => {
    active?.tracker.onPath(router.state.location.pathname);
    return router.subscribe(state => active?.tracker.onPath(state.location.pathname));
};
