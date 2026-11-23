import { isTelemetryEntry } from '../core/kind';
import { createLogId } from '../core/logId';

import type { LogEntry, LogLevel, TelemetryKind } from '../core/types';

export const DEFAULT_QUEUE_CAPACITY = 500;

export const DEFAULT_QUEUE_MAX_BYTES = 512 * 1024;

export const DEFAULT_STAT_QUEUE_CAPACITY = 500;
export const DEFAULT_STAT_QUEUE_MAX_BYTES = 256 * 1024;
export const APP_STAT_QUEUE_CAPACITY = 300;
export const APP_STAT_QUEUE_MAX_BYTES = 160 * 1024;

export interface LogUploadQueueOptions {
    capacity?: number;
    maxBytes?: number;
    acceptDebug?: boolean;
    onDrop?: (dropped: LogEntry[]) => void;
    statCapacity?: number;
    statMaxBytes?: number;
    onStatDrop?: (dropped: LogEntry[]) => void;
}

const DROP_PRIORITY: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const STAT_DROP_PRIORITY: TelemetryKind[] = ['sample', 'trace', 'event'];

const statRank = (entry: LogEntry): TelemetryKind =>
    STAT_DROP_PRIORITY.includes(entry.kind as TelemetryKind) ? (entry.kind as TelemetryKind) : 'sample';

const UNMEASURABLE_ENTRY_BYTES = 1024;

export class LogUploadQueue {
    private readonly capacity: number;
    private readonly maxBytes: number;
    private readonly acceptDebug: boolean;
    private readonly onDrop?: (dropped: LogEntry[]) => void;
    private readonly statCapacity: number;
    private readonly statMaxBytes: number;
    private readonly onStatDrop?: (dropped: LogEntry[]) => void;
    private entries: LogEntry[] = [];
    private droppedEntries = 0;
    private droppedStatEntries = 0;
    private readonly measured = new WeakMap<LogEntry, number>();

    constructor(options: LogUploadQueueOptions = {}) {
        this.capacity = options.capacity ?? DEFAULT_QUEUE_CAPACITY;
        this.maxBytes = options.maxBytes ?? DEFAULT_QUEUE_MAX_BYTES;
        this.acceptDebug = options.acceptDebug ?? false;
        this.onDrop = options.onDrop;
        this.statCapacity = options.statCapacity ?? DEFAULT_STAT_QUEUE_CAPACITY;
        this.statMaxBytes = options.statMaxBytes ?? DEFAULT_STAT_QUEUE_MAX_BYTES;
        this.onStatDrop = options.onStatDrop;
    }

    public push(entry: LogEntry): void {
        if (entry.level === 'debug' && !this.acceptDebug) return;

        this.entries.push(entry);
        this.enforceCapacity();
    }

    public pushAll(incoming: LogEntry[]): void {
        if (!incoming.length) return;

        const shippable = this.acceptDebug ? incoming : incoming.filter(entry => entry.level !== 'debug');
        if (!shippable.length) return;

        const queuedIds = new Set(this.entries.map(entry => entry.id).filter(Boolean));
        const fresh = shippable.filter(entry => !entry.id || !queuedIds.has(entry.id));
        if (!fresh.length) return;

        this.entries.push(...fresh);
        this.enforceCapacity();
    }

    public nextBatch(limit: number): LogEntry[] {
        if (limit <= 0 || !this.entries.length) return [];
        return this.entries.slice(0, limit);
    }

    public sendableSize(): number {
        return this.entries.length;
    }

    public remove(sent: LogEntry[]): void {
        if (!sent.length) return;

        const sentIds = new Set(sent.map(entry => entry.id));
        const withoutId = sent.filter(entry => !entry.id);

        this.entries = this.entries.filter(entry => {
            if (entry.id) return !sentIds.has(entry.id);
            return !withoutId.includes(entry);
        });
    }

    public snapshot(): LogEntry[] {
        return [...this.entries];
    }

    public restore(restored: LogEntry[]): void {
        const kept = this.acceptDebug ? restored : restored.filter(entry => entry.level !== 'debug');
        this.entries = kept.map(entry => (entry.id ? entry : { ...entry, id: createLogId() }));
        this.enforceCapacity();
    }

    public size(): number {
        return this.entries.length;
    }

    public statSize(): number {
        return this.entries.filter(isTelemetryEntry).length;
    }

    public droppedCount(): number {
        return this.droppedEntries;
    }

    public droppedStatCount(): number {
        return this.droppedStatEntries;
    }

    public headroom(): number {
        return Math.max(0, this.capacity - (this.entries.length - this.statSize()));
    }

    public statHeadroom(): number {
        return Math.max(0, this.statCapacity - this.statSize());
    }

    public clear(): void {
        this.entries = [];
    }

    public clearStats(): void {
        this.entries = this.entries.filter(entry => !isTelemetryEntry(entry));
    }

    private sizeOf(entry: LogEntry): number {
        const cached = this.measured.get(entry);
        if (cached !== undefined) return cached;

        let size: number;
        try {
            size = JSON.stringify(entry)?.length ?? UNMEASURABLE_ENTRY_BYTES;
        } catch {
            size = UNMEASURABLE_ENTRY_BYTES;
        }

        this.measured.set(entry, size);
        return size;
    }

    private bytesOf(members: LogEntry[]): number {
        return members.reduce((sum, entry) => sum + this.sizeOf(entry), 0);
    }

    private overflowOf<K>(
        members: LogEntry[],
        capacity: number,
        maxBytes: number,
        order: K[],
        rank: (entry: LogEntry) => K | undefined
    ): Set<LogEntry> {
        const doomed = new Set<LogEntry>();
        let bytes = this.bytesOf(members);
        if (members.length <= capacity && bytes <= maxBytes) return doomed;

        const overflow = members.length - capacity;

        const over = () => doomed.size < overflow || bytes > maxBytes;

        for (const key of order) {
            if (!over()) break;
            for (const entry of members) {
                if (!over()) break;
                if (rank(entry) !== key || doomed.has(entry)) continue;
                doomed.add(entry);
                bytes -= this.sizeOf(entry);
            }
        }

        return doomed;
    }

    private enforceCapacity(): void {
        const logs: LogEntry[] = [];
        const stats: LogEntry[] = [];
        for (const entry of this.entries) (isTelemetryEntry(entry) ? stats : logs).push(entry);

        const doomedLogs = this.overflowOf(logs, this.capacity, this.maxBytes, DROP_PRIORITY, entry => entry.level);
        const doomedStats = this.overflowOf(stats, this.statCapacity, this.statMaxBytes, STAT_DROP_PRIORITY, statRank);
        if (!doomedLogs.size && !doomedStats.size) return;

        const droppedLogs = logs.filter(entry => doomedLogs.has(entry));
        const droppedStats = stats.filter(entry => doomedStats.has(entry));
        this.entries = this.entries.filter(entry => !doomedLogs.has(entry) && !doomedStats.has(entry));

        this.droppedEntries += droppedLogs.length;
        this.droppedStatEntries += droppedStats.length;

        if (droppedLogs.length) this.onDrop?.(droppedLogs);
        if (droppedStats.length) this.onStatDrop?.(droppedStats);
    }
}

export const createLogUploadQueue = (options: LogUploadQueueOptions = {}): LogUploadQueue =>
    new LogUploadQueue(options);
