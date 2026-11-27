import type { PendingReportInfo } from '@chatic/bridge-messages';

export interface IPendingReportQueueService {
    enqueue(report: Omit<PendingReportInfo, 'id'>): void;
    list(): PendingReportInfo[];
    ack(ids: string[]): number;
    size(): number;
}
