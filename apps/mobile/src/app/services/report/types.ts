import type { PendingReportInfo } from '@chatic/app-messages';

/**
 * Queue for reports the native side detected but cannot send itself — the
 * `/hello/report` signing token lives only in the WebView's web session, so
 * entries wait here (MMKV) until the web pulls and relays them (ADR-0047).
 */
export interface IPendingReportQueueService {
    /** Adds a report (id is assigned); the oldest entries drop past the cap. */
    enqueue(report: Omit<PendingReportInfo, 'id'>): void;
    /** Returns all queued reports, oldest first. */
    list(): PendingReportInfo[];
    /** Removes relayed reports by id and returns the remaining queue size. */
    ack(ids: string[]): number;
    /** Number of queued reports. */
    size(): number;
}
