import { reportPerfMetric } from '@chatic/logger';
import type { BootRecord, BootType, NativeBootMarkKey, SendBootMetricsPayload } from '@chatic/app-messages';

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

    constructor(
        private readonly logService: ILogService,
        private readonly storage: IKeyValueStorage,
        private readonly appVersion: string,
        private readonly now: () => number = Date.now
    ) {
        this.baselineAtMs = this.now();
    }

    public mark(key: NativeBootMarkKey): void {
        // First occurrence wins within a session (SPA navigations re-fire load events).
        if (this.finalized || this.marks[key] != null) return;
        this.marks[key] = this.now() - this.baselineAtMs;

        if (key === 'web-app-ready') {
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

        this.reportBootMetric(record);
    }

    /**
     * Emits the boot number as a structured metric entry (ADR-0071).
     *
     * Alongside the human line above rather than replacing it: that line is
     * already shipping and already read, and the two have different jobs — one
     * is a sentence someone scans in the log monitor, this is a payload a script
     * parses. It only leaves sampled runs, so the cost is one extra entry in
     * roughly one launch out of ten.
     *
     * Outside the try/catch on purpose. A storage failure does not invalidate
     * the measurement, and `reportPerfMetric` must not be mistaken for part of
     * what the catch above is protecting.
     */
    private reportBootMetric(record: BootRecord): void {
        // A session that never reached WebAppReady has no boot duration to
        // report. It is still persisted — an aborted boot is worth keeping — but
        // it is not a sample of "how long boot takes".
        if (record.totalMs == null) return;

        // `bootType` rides along because a reload session re-baselines on a
        // WebView content-process crash — a different measurement, and one that
        // lands disproportionately on memory-pressured devices. The 1.5s budget
        // is the cold number; without this key the two would be indistinguishable
        // once they reach the server.
        reportPerfMetric('boot', record.totalMs, { marks: record.native, bootType: record.type });
    }
}
