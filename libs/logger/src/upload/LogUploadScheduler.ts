import { DEFAULT_BACKOFF_MS, DEFAULT_BATCH_SIZE, DEFAULT_INTERVAL_MS, DEFAULT_MAX_ATTEMPTS } from './uploadPolicy';

import { isTelemetryEntry } from '../core/kind';

import type { TimerHandle, UploadOutcome } from './uploadPolicy';

const MAX_SKIP_ROUNDS = 10;
import type { LogStoreReader } from './LogStore';
import type { LogEntry } from '../core/types';

export interface LogUploadSchedulerOptions {
    store: LogStoreReader;
    send: (entries: LogEntry[]) => Promise<UploadOutcome>;
    batchSize?: number;
    intervalMs?: number;
    backoffMs?: number[];
    maxAttempts?: number;
    isEnabled?: () => boolean;
    onGiveUp?: (entries: LogEntry[], attempts: number) => void;
    onSettled?: () => void;
    selectTelemetry?: (entries: LogEntry[]) => LogEntry[];
    schedule?: (run: () => void, ms: number) => TimerHandle;
    cancel?: (handle: TimerHandle) => void;
}

export class LogUploadScheduler {
    private readonly store: LogStoreReader;
    private readonly send: (entries: LogEntry[]) => Promise<UploadOutcome>;
    private readonly batchSize: number;
    private readonly intervalMs: number;
    private readonly backoffMs: number[];
    private readonly maxAttempts: number;
    private readonly isEnabled?: () => boolean;
    private readonly onGiveUp?: (entries: LogEntry[], attempts: number) => void;
    private readonly onSettled?: () => void;
    private readonly selectTelemetry?: (entries: LogEntry[]) => LogEntry[];
    private readonly scheduleTimer: (run: () => void, ms: number) => TimerHandle;
    private readonly cancelTimer: (handle: TimerHandle) => void;

    private timer?: TimerHandle;
    private running = false;
    private inFlight = false;
    private attempts = 0;

    constructor(options: LogUploadSchedulerOptions) {
        this.store = options.store;
        this.send = options.send;
        this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
        this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
        this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
        this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        this.isEnabled = options.isEnabled;
        this.onGiveUp = options.onGiveUp;
        this.onSettled = options.onSettled;
        this.selectTelemetry = options.selectTelemetry;
        this.scheduleTimer = options.schedule ?? ((run, ms) => setTimeout(run, ms));
        this.cancelTimer = options.cancel ?? (handle => clearTimeout(handle));
    }

    public start(): void {
        if (this.running) return;
        this.running = true;
        this.armTimer(this.intervalMs);
    }

    public stop(): void {
        this.running = false;
        this.clearTimer();
    }

    public flushNow(): Promise<void> {
        return this.flush();
    }

    private clearTimer(): void {
        if (this.timer === undefined) return;
        this.cancelTimer(this.timer);
        this.timer = undefined;
    }

    private armTimer(ms: number): void {
        if (!this.running) return;
        this.clearTimer();
        this.timer = this.scheduleTimer(() => {
            this.timer = undefined;
            void this.flush();
        }, ms);
    }

    private async release(batch: LogEntry[]): Promise<void> {
        try {
            await this.store.ack(batch);
        } catch {
            /* keep going — the entries stay put and ride the next batch */
        }
    }

    private select(drawn: LogEntry[]): { send: LogEntry[]; skip: LogEntry[] } {
        if (!this.selectTelemetry) return { send: drawn, skip: [] };

        const telemetry = drawn.filter(isTelemetryEntry);
        if (!telemetry.length) return { send: drawn, skip: [] };

        let chosen: LogEntry[];
        try {
            chosen = this.selectTelemetry(telemetry);
        } catch {
            return { send: drawn, skip: [] };
        }

        const byId = new Map<string, LogEntry>();
        const chosenIdentity = new Set<LogEntry>();
        for (const entry of chosen) {
            if (entry.id) byId.set(entry.id, entry);
            else chosenIdentity.add(entry);
        }

        const send: LogEntry[] = [];
        const skip: LogEntry[] = [];
        for (const entry of drawn) {
            if (!isTelemetryEntry(entry)) send.push(entry);
            else if (entry.id && byId.has(entry.id)) send.push(byId.get(entry.id) as LogEntry);
            else if (!entry.id && chosenIdentity.has(entry)) send.push(entry);
            else skip.push(entry);
        }
        return { send, skip };
    }

    private async settle(outcome: 'done' | 'retry', batch: LogEntry[]): Promise<void> {
        if (outcome === 'done') {
            this.attempts = 0;
            this.armTimer(this.intervalMs);
            this.onSettled?.();
            return;
        }

        this.attempts += 1;

        if (this.attempts >= this.maxAttempts) {
            await this.release(batch);
            this.onGiveUp?.(batch, this.attempts);
            this.attempts = 0;
            this.armTimer(this.intervalMs);
            this.onSettled?.();
            return;
        }

        this.armTimer(this.backoffMs[Math.min(this.attempts - 1, this.backoffMs.length - 1)]);
        this.onSettled?.();
    }

    private async flush(): Promise<void> {
        if (!this.running || this.inFlight) return;

        if (this.isEnabled && !this.isEnabled()) {
            this.armTimer(this.intervalMs);
            return;
        }

        this.inFlight = true;
        try {
            let batch: LogEntry[] = [];
            let skipped = 0;
            for (let round = 0; round < MAX_SKIP_ROUNDS; round += 1) {
                let drawn: LogEntry[];
                try {
                    drawn = await this.store.peek(this.batchSize);
                } catch {
                    this.armTimer(this.intervalMs);
                    if (skipped) this.onSettled?.();
                    return;
                }

                const selected = this.select(drawn);
                batch = selected.send;

                if (selected.skip.length) {
                    await this.release(selected.skip);
                    skipped += selected.skip.length;
                }

                if (batch.length || !selected.skip.length) break;
            }

            if (!batch.length) {
                this.armTimer(this.intervalMs);
                if (skipped) this.onSettled?.();
                return;
            }

            try {
                const outcome = await this.send(batch);

                if (outcome === 'retry') {
                    await this.settle('retry', batch);
                    return;
                }

                await this.release(batch);
                await this.settle('done', batch);
            } catch {
                await this.settle('retry', batch);
            }
        } finally {
            this.inFlight = false;
        }
    }
}

export const createLogUploadScheduler = (options: LogUploadSchedulerOptions): LogUploadScheduler =>
    new LogUploadScheduler(options);
