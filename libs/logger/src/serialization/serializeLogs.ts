import { toWireLogEntry, type WireLogEntry } from './wire';

import type { LogEntry } from '../core/types';

/**
 * A log entry flattened for the app's unsent-upload store (MMKV).
 *
 * **Identical to the wire shape, on purpose.** These entries are read back at boot and handed to
 * the uploader, which maps them for the server — so anything this drops is dropped from the upload
 * too. It used to keep only `level`/`tag`/`message`/`timestamp`, which cost two things:
 *
 *  - **The whole occurrence-time context.** `runId`, `uid`, `sid`, `cid`, `appVersion`,
 *    `webVersion`, `route`, `os`, `osVersion`, `model` — all ten. Every entry that outlived the
 *    process arrived at the server with no user, no run, no version and no screen. Those are the
 *    entries from a run that was killed or crashed, which is to say the ones most worth tracing.
 *  - **`id`.** It is the server's dedup key AND the key the WebView acks by
 *    (`LogUploadQueueService.ack` matches on it), so a restored entry could not be removed from the
 *    queue after a successful upload: it shipped again on every cycle, and the server stored a new
 *    document each time because it had no id to dedup on.
 *
 * The web's own queue never had this problem — it persists through `toWireLogEntry`. Two stores
 * doing the same job disagreed, so this one now shares that mapping and keeps only what is genuinely
 * its own: the total budget below.
 */
export type SerializedLog = WireLogEntry;

/**
 * Max serialized chars kept for a single message/data/error field.
 *
 * Mirrors `WIRE_FIELD_CHAR_LIMIT`, which is what actually applies the cap now. Kept exported
 * because the cap is part of this function's contract to its caller.
 */
export const PER_FIELD_CHAR_LIMIT = 2_000;
/** Max total serialized chars across all included logs (payload-size guard). */
export const TOTAL_CHAR_BUDGET = 40_000;

/** What one record costs against the budget. Context fields are short but not free. */
const sizeOf = (item: SerializedLog): number =>
    (item.message?.length ?? 0) + (item.data?.length ?? 0) + (item.error?.length ?? 0);

/**
 * Flatten log entries for storage, truncating each field and staying within
 * `TOTAL_CHAR_BUDGET`. Pass entries oldest→newest; when the budget is exceeded
 * the OLDEST entries are dropped (the newest logs — closest to the reported
 * event — are the most useful, so they are kept). Output stays chronological.
 *
 * Masking and the per-field cap both come from `toWireLogEntry`; this adds the total budget, which
 * the wire mapper has no reason to carry (a batch is sized by the queue, an MMKV record is not).
 */
export const serializeLogs = (entries: LogEntry[]): SerializedLog[] => {
    const out: SerializedLog[] = [];
    let remaining = TOTAL_CHAR_BUDGET;

    // Walk newest→oldest so the budget is spent on the most recent entries first.
    for (let i = entries.length - 1; i >= 0; i -= 1) {
        const item = toWireLogEntry(entries[i]);

        const size = sizeOf(item);
        if (size > remaining) break; // budget exhausted — drop the remaining (older) entries
        remaining -= size;
        out.push(item);
    }

    return out.reverse(); // restore chronological (oldest→newest) order
};
