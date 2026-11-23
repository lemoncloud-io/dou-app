import { recordPerfSample, startPerfTrace } from '@chatic/perf';
import type { BootRecord, BootType, NativeBootMarkKey, SendBootMetricsPayload } from '@chatic/bridge-messages';
import type { PerfTrace } from '@chatic/perf';

import type { IKeyValueStorage } from '../../database';
import type { WebRevealReason } from '../bootSplash/types';
import type { ILogService } from '../log';

export type { BootRecord, BootType, NativeBootMarkKey };

export interface IBootMetricsService {
    mark(key: NativeBootMarkKey): void;
    startReloadSession(): void;
    attachWebMetrics(payload: SendBootMetricsPayload): void;
    recordForegroundResume(durationMs: number): void;
    recordReveal(reason: WebRevealReason): void;
    markRestart(): void;
    getContentProcessReloadCount(): number;
    getLastForegroundResumeMs(): number | null;
    getRecords(): Promise<BootRecord[]>;
    clearRecords(): Promise<void>;
}

const STORAGE_KEY = 'bootMetrics.records';
const MAX_RECORDS = 50;
const WEB_METRICS_TIMEOUT_MS = 5000;

export class BootMetricsService implements IBootMetricsService {
    private baselineAtMs: number;
    private marks: Partial<Record<NativeBootMarkKey, number>> = {};
    private type: BootType = 'cold';
    private webMetrics: SendBootMetricsPayload | null = null;
    private finalized = false;
    private finalizeTimer: ReturnType<typeof setTimeout> | null = null;

    private contentProcessReloadCount = 0;
    private lastForegroundResumeMs: number | null = null;

    private bootTrace: PerfTrace;

    private firstScreenRecorded = false;

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
        if (this.finalized || this.marks[key] != null) return;
        this.marks[key] = this.now() - this.baselineAtMs;

        if (key === 'web-app-ready') {
            this.stopBootTrace();
            if (this.webMetrics) void this.finalize();
            else this.finalizeTimer = setTimeout(() => void this.finalize(), WEB_METRICS_TIMEOUT_MS);
        }
    }

    public startReloadSession(): void {
        this.contentProcessReloadCount += 1;
        if (!this.finalized && this.marks['load-start'] != null) void this.finalize();

        this.baselineAtMs = this.now();
        this.marks = {};
        this.webMetrics = null;
        this.finalized = false;
        this.firstScreenRecorded = false;
        this.type = 'reload';
        this.bootTrace = startPerfTrace('boot');
    }

    public markRestart(): void {
        if (this.type === 'cold') this.type = 'restart';
    }

    public attachWebMetrics(payload: SendBootMetricsPayload): void {
        this.webMetrics = payload;
        if (!this.finalized && this.marks['web-app-ready'] != null) {
            void this.finalize();
        }
    }

    public recordForegroundResume(durationMs: number): void {
        this.lastForegroundResumeMs = Math.round(durationMs);
    }

    public recordReveal(reason: WebRevealReason): void {
        if (this.firstScreenRecorded) return;
        this.firstScreenRecorded = true;
        const webAppReady = this.marks['web-app-ready'];
        recordPerfSample('first_screen', {
            attributes: { boot_type: this.type, reveal: reason },
            metrics: {
                value_ms: this.now() - this.baselineAtMs,
                ...(webAppReady == null ? {} : { web_app_ready: webAppReady }),
            },
        });
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
            const next = [record, ...records].slice(0, MAX_RECORDS);
            await this.storage.set(STORAGE_KEY, next);
            this.logService.info('PERF', `Boot record persisted (${record.type}, total ${record.totalMs}ms)`);
        } catch (e) {
            this.logService.error('PERF', 'Failed to persist boot record', e as Error);
        }
    }

    private stopBootTrace(): void {
        this.bootTrace.putAttribute('boot_type', this.type);
        for (const [key, ms] of Object.entries(this.marks)) {
            if (ms != null) this.bootTrace.putMetric(key.replace(/-/g, '_'), ms);
        }
        this.bootTrace.stop();
    }
}
