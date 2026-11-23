import { toWireLogEntry, type WireLogEntry } from './wire';

import type { LogEntry } from '../core/types';

export type SerializedLog = WireLogEntry;

export const PER_FIELD_CHAR_LIMIT = 2_000;
export const TOTAL_CHAR_BUDGET = 40_000;

const sizeOf = (item: SerializedLog): number =>
    (item.message?.length ?? 0) + (item.data?.length ?? 0) + (item.error?.length ?? 0);

export const serializeLogs = (entries: LogEntry[]): SerializedLog[] => {
    const out: SerializedLog[] = [];
    let remaining = TOTAL_CHAR_BUDGET;

    for (let i = entries.length - 1; i >= 0; i -= 1) {
        const item = toWireLogEntry(entries[i]);

        const size = sizeOf(item);
        if (size > remaining) break;
        remaining -= size;
        out.push(item);
    }

    return out.reverse();
};
