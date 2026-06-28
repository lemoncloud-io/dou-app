// Home feature view-state entities and types. Pure types only — no React hooks live here.
import type { DomainChannel, DomainPlace } from '@chatic/data';

export type { DomainChannel, DomainPlace };

export * from './invite';

/** Per-channel unread message counts keyed by channel id, plus the aggregate total. */
export interface ChannelUnreads {
    /** unread count per channel id (clamped to >= 0). */
    byChannel: Record<string, number>;
    /** sum of all per-channel unread counts. */
    total: number;
}
