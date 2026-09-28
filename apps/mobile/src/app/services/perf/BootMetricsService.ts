import { startPerfTrace } from '@chatic/perf';
import type { BootRecord, BootType, NativeBootMarkKey, SendBootMetricsPayload } from '@chatic/app-messages';
import type { PerfTrace } from '@chatic/perf';

import type { IKeyValueStorage } from '../../database';
import type { ILogService } from '../log';

/**
 * The record shape and its two supporting unions moved to `@chatic/app-messages`
 * (`types/model/perf.ts`) when `FetchBootRecords` made the record cross the bridge — the web now
 * reads these, so one declaration is what keeps the two sides from drifting.
 *
 * Re-exported here so existing importers keep working; the baseline the milestones are relative to
 * is still this service's (DependencyProvider construction for cold boots, the reload trigger for
 * WebView content-process reloads).
 */
export type { BootRecord, BootType, NativeBootMarkKey };

export interface IBootMetricsService {
    mark(key: NativeBootMarkKey): void;
    /** Start a fresh session for a WebView content-process reload (perceived as a re-boot). */
    startReloadSession(): void;
    attachWebMetrics(payload: SendBootMetricsPayload): void;
    recordForegroundResume(durationMs: number): void;
    getContentProcessReloadCount(): number;
    getLastForegroundResumeMs(): number | null;
    getRecords(): Promise<BootRecord[]>;
    clearRecords(): Promise<void>;
}

const STORAGE_KEY = 'bootMetrics.records';
const MAX_RECORDS = 50;
/** How long to wait for the web snapshot after WebAppReady before persisting without it. */
const WEB_METRICS_TIMEOUT_MS = 5000;

/**
 * Owns the native half of the boot timeline and persists one BootRecord per
 * boot session (cold start or content-process reload) into an MMKV ring
 * buffer. Records survive WebView reloads and app restarts, so before/after
 * comparisons can be made on-device from the debug menu.
 */
export class BootMetricsService implements IBootMetricsService {
    private baselineAtMs: number;
    private marks: Partial<Record<NativeBootMarkKey, number>> = {};
    private type: BootType = 'cold';
    private webMetrics: SendBootMetricsPayload | null = null;
    private finalized = false;
    private finalizeTimer: ReturnType<typeof setTimeout> | null = null;

    private contentProcessReloadCount = 0;
    private lastForegroundResumeMs: number | null = null;

    /**
     * The Firebase `boot` trace for the current session. Started with the baseline and replaced
     * with it, so Firebase's own duration runs over the same span as `totalMs`.
     */
    private bootTrace: PerfTrace;

    constructor(
        private readonly logService: ILogService,
        private readonly storage: IKeyValueStorage,
        private readonly appVersion: string,
        private readonly now: () => number = Date.now
    ) {
        this.baselineAtMs = this.now();
        this.bootTrace = startPerfTrace('boot');
    }

    public mark(key: NativeBootMarkKey): void {
        // First occurrence wins within a session (SPA navigations re-fire load events).
        if (this.finalized || this.marks[key] != null) return;
        this.marks[key] = this.now() - this.baselineAtMs;

        if (key === 'web-app-ready') {
            this.stopBootTrace();
            // Give the web snapshot a grace window, then persist either way.
            if (this.webMetrics) void this.finalize();
            else this.finalizeTimer = setTimeout(() => void this.finalize(), WEB_METRICS_TIMEOUT_MS);
        }
    }

    public startReloadSession(): void {
        this.contentProcessReloadCount += 1;
        // If the previous session never reached WebAppReady, persist what we have
        // first — an aborted boot is exactly the kind of record worth keeping.
        if (!this.finalized && this.marks['load-start'] != null) void this.finalize();

        this.baselineAtMs = this.now();
        this.marks = {};
        this.webMetrics = null;
        this.finalized = false;
        this.type = 'reload';
        // The previous session's trace is left unstopped when it never reached WebAppReady, which
        // Firebase treats as never having happened: an aborted boot is kept in the ring buffer
        // above, but it is not a sample of how long boot takes.
        this.bootTrace = startPerfTrace('boot');
    }

    public attachWebMetrics(payload: SendBootMetricsPayload): void {
        this.webMetrics = payload;
        // Arrived after WebAppReady: cancel the grace timer and persist now.
        if (!this.finalized && this.marks['web-app-ready'] != null) {
            void this.finalize();
        }
    }

    public recordForegroundResume(durationMs: number): void {
        this.lastForegroundResumeMs = Math.round(durationMs);
    }

    public getContentProcessReloadCount(): number {
        return this.contentProcessReloadCount;
    }

    public getLastForegroundResumeMs(): number | null {
        return this.lastForegroundResumeMs;
    }

    public async getRecords(): Promise<BootRecord[]> {
        return (await this.storage.get<BootRecord[]>(STORAGE_KEY)) ?? [];
    }

    public async clearRecords(): Promise<void> {
        await this.storage.remove(STORAGE_KEY);
    }

    private async finalize(): Promise<void> {
        if (this.finalized) return;
        this.finalized = true;
        if (this.finalizeTimer) {
            clearTimeout(this.finalizeTimer);
            this.finalizeTimer = null;
        }

        const record: BootRecord = {
            finalizedAt: this.now(),
            type: this.type,
            appVersion: this.appVersion,
            native: { ...this.marks },
            web: this.webMetrics,
            totalMs: this.marks['web-app-ready'] ?? null,
        };

        try {
            const records = await this.getRecords();
            // Newest first, capped ring buffer.
            const next = [record, ...records].slice(0, MAX_RECORDS);
            await this.storage.set(STORAGE_KEY, next);
            this.logService.info('PERF', `Boot record persisted (${record.type}, total ${record.totalMs}ms)`);
        } catch (e) {
            this.logService.error('PERF', 'Failed to persist boot record', e as Error);
        }
    }

    /**
     * Closes the `boot` trace at WebAppReady — the endpoint the 1.5s target is defined on.
     *
     * At the mark, not at `finalize`: finalizing waits up to five seconds more for the web
     * snapshot, and Firebase would count that wait as boot. The human line in `finalize` is
     * untouched; the two have different readers.
     *
     * `boot_type` rides along because a reload session re-baselines on a WebView content-process
     * crash — a different measurement, and one that lands disproportionately on memory-pressured
     * devices. The target is the cold number; without the attribute the two could not be told
     * apart in the console.
     */
    private stopBootTrace(): void {
        this.bootTrace.putAttribute('boot_type', this.type);
        for (const [key, ms] of Object.entries(this.marks)) {
            // Firebase metric names allow no dashes, so the mark keys are rewritten for the trace.
            if (ms != null) this.bootTrace.putMetric(key.replace(/-/g, '_'), ms);
        }
        this.bootTrace.stop();
    }
}
