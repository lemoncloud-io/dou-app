import { createMMKV } from 'react-native-mmkv';
import type { PendingReportInfo } from '@chatic/app-messages';
import type { IPendingReportQueueService } from './types';

const PENDING_REPORTS_STORAGE_KEY = '@chatic/report.pending';

/** Cap so a crash loop cannot grow the queue unbounded (oldest drop first). */
export const MAX_PENDING_REPORTS = 20;

/**
 * MMKV-backed deferred report queue (ADR-0047). Persistence is synchronous so
 * detection paths (global error handler, WebView crash callback) can enqueue
 * without an async boundary that might not survive the process.
 */
export class PendingReportQueueService implements IPendingReportQueueService {
    private readonly mmkv = createMMKV();

    public enqueue(report: Omit<PendingReportInfo, 'id'>): void {
        try {
            const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            const next = [...this.list(), { ...report, id }].slice(-MAX_PENDING_REPORTS);
            this.mmkv.set(PENDING_REPORTS_STORAGE_KEY, JSON.stringify(next));
        } catch {
            /* queue failures must never break the detection path */
        }
    }

    public list(): PendingReportInfo[] {
        try {
            const raw = this.mmkv.getString(PENDING_REPORTS_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw) as PendingReportInfo[];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    public ack(ids: string[]): number {
        const remaining = this.list().filter(report => !ids.includes(report.id));
        try {
            this.mmkv.set(PENDING_REPORTS_STORAGE_KEY, JSON.stringify(remaining));
        } catch {
            /* noop */
        }
        return remaining.length;
    }

    public size(): number {
        return this.list().length;
    }
}
