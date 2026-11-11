/**
 * `lib/report-logs/eventTime.ts`
 * - The one place that decides which of a row's two clocks the screen uses.
 *
 * A batch-uploaded log carries `timestamp` (when it happened on the device) while the
 * record's `createdAt` is when the server received it. Uploads arrive in batches, so
 * `createdAt` bunches up: a dozen entries spanning two minutes of real time land within
 * milliseconds of each other. Ordering or bucketing by `createdAt` therefore loses the
 * sequence, which is the one thing a tracking view exists to show.
 *
 * The server cannot help here — its range filter and its default sort are both on
 * `createdAt` (chatic-backend-api `addSortTerm`), and `timestamp` is not a queryable
 * axis. So the split is deliberate and permanent: the server narrows by arrival, the
 * screen orders by occurrence.
 *
 * The cost of that split is an edge effect: a log that happened just before the range
 * start but arrived inside it is included, and its displayed time falls outside the
 * requested window. `isOutsideRange` names that case so the UI can say so instead of
 * looking wrong.
 */
import type { ReportLogRow } from './parseReportLog';

/**
 * Widest instant either clock is allowed to name: 1970 through roughly 2286.
 *
 * `timestamp` is whatever the device wrote and is only checked for `typeof === 'number'`
 * on the way in, so a client stamping microseconds or nanoseconds (1.7e15, 1.7e18) gets
 * through. One such row is enough to do real damage downstream — `new Date(x).toISOString()`
 * throws `RangeError` past 8.64e15 and would take the whole CSV export with it, and
 * `bucketReportLogs` spans min→max so a row dated year 55000 collapses every other row
 * into one bar and makes the spike detector read that bogus bucket as "now".
 *
 * Rejecting here means every consumer of `eventAt` is protected at once.
 */
const MAX_PLAUSIBLE_MS = 9_999_999_999_999;

/** A clock value this screen is willing to treat as a real instant. */
const plausible = (ms?: number): number | undefined =>
    typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 && ms <= MAX_PLAUSIBLE_MS ? ms : undefined;

/**
 * Occurrence time, falling back to arrival time.
 *
 * Slack reports (issue / legacy error) have no `timestamp` at all, so they always fall
 * back — which is correct for them, since they were sent the moment they happened.
 */
export const eventAt = (row: ReportLogRow): number | undefined => plausible(row.timestamp) ?? plausible(row.createdAt);

/**
 * How long the row sat on the device before reaching the server, or `undefined` when
 * either clock is missing. Negative values (device clock ahead of the server) are
 * clamped to 0 — a skewed device clock is not a delay.
 */
export const ingestLagMs = (row: ReportLogRow): number | undefined => {
    const occurred = plausible(row.timestamp);
    const arrived = plausible(row.createdAt);
    if (occurred === undefined || arrived === undefined) return undefined;
    return Math.max(0, arrived - occurred);
};

/**
 * Threshold above which the gap is worth showing. A batch upload flushes on an interval,
 * so a few seconds of lag is normal and marking it would mark everything; a minute or
 * more means the entry waited for a flush, a retry, or a reconnect, and that changes how
 * the reader should treat the ordering.
 */
export const LAG_NOTICE_MS = 60_000;

/** True when the row's arrival lagged its occurrence enough to be worth a badge. */
export const hasNoticeableLag = (row: ReportLogRow, threshold = LAG_NOTICE_MS): boolean => {
    const lag = ingestLagMs(row);
    return lag !== undefined && lag >= threshold;
};

/**
 * True when the row's displayed (occurrence) time falls outside the requested range,
 * which the server matched on arrival time. `fromMs`/`toMs` are the range bounds in ms;
 * either may be omitted for an open-ended range.
 *
 * This is the honest name for "why is a row from yesterday in my today view".
 */
export const isOutsideRange = (row: ReportLogRow, fromMs?: number, toMs?: number): boolean => {
    const at = eventAt(row);
    if (at === undefined) return false;
    if (fromMs !== undefined && at < fromMs) return true;
    if (toMs !== undefined && at > toMs) return true;
    return false;
};

/**
 * Comparators, written with comparisons rather than subtraction.
 *
 * Subtracting sentinels produces `NaN` when both rows lack a clock (`-Infinity` minus
 * `-Infinity`), and a `NaN` comparator result makes the sort order implementation-defined
 * for that subset. Clockless rows are common enough here — `createdAt` is optional and a
 * device timestamp can be rejected as implausible — to be worth the explicit form.
 * Clockless rows sort to the end of either order, and tie with each other.
 */
const compareEventAt = (a: ReportLogRow, b: ReportLogRow, newestFirst: boolean): number => {
    const left = eventAt(a);
    const right = eventAt(b);
    if (left === right) return 0;
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    if (left === right) return 0;
    return newestFirst ? (right > left ? 1 : -1) : left > right ? 1 : -1;
};

/** Newest-occurrence-first, for the list view. Rows with no clock sink to the end. */
export const byEventAtDesc = (a: ReportLogRow, b: ReportLogRow): number => compareEventAt(a, b, true);

/** Oldest-occurrence-first, for the run timeline. Rows with no clock sink to the end. */
export const byEventAtAsc = (a: ReportLogRow, b: ReportLogRow): number => compareEventAt(a, b, false);
