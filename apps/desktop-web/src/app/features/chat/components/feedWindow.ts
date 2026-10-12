import type { MessageRowItem } from '../utils';

/** Stable measurement + React key for one feed row. */
export const feedRowKeyOf = (row: MessageRowItem): string => (row.kind === 'group' ? row.group.key : row.key);

/** First and past-the-end row indexes to mount. End is exclusive. */
export interface FeedWindow {
    start: number;
    end: number;
}

/** Height budget rendered above and below the viewport so fast scrolls stay covered. */
export const FEED_OVERSCAN_PX = 800;

/** Fallback row height until a row is measured (a one-line text block). */
export const FEED_DEFAULT_ESTIMATE_PX = 120;

/**
 * Inter-row gap the spacer math accounts for (`gap-2` on the feed). Approximate
 * (rem-based), off by a pixel under zoom — absorbed by the overscan either way.
 */
export const FEED_GAP_PX = 8;

/** Bounded retries scrolling an unmounted jump target into its window. */
export const MAX_JUMP_WINDOW_RETRIES = 12;
export const JUMP_WINDOW_RETRY_MS = 60;

/** Index of the row holding a chat message, or -1 when it is not loaded. */
export const indexOfChatNo = (rows: MessageRowItem[], chatNo: number): number => {
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.kind !== 'group') continue;
        if (row.group.messages.some(message => message.chatNo === chatNo)) return i;
    }
    return -1;
};

/**
 * Which rows to mount so the viewport (plus overscan) is covered. Prefix sums
 * over per-row heights; linear scan — feeds hold hundreds of rows, and clarity
 * beats a binary search here. `heightOf` must return measured heights where
 * known and the running estimate elsewhere.
 */
export const windowForViewport = ({
    count,
    heightOf,
    scrollTop,
    viewportHeight,
    overscanPx = FEED_OVERSCAN_PX,
}: {
    count: number;
    heightOf: (index: number) => number;
    scrollTop: number;
    viewportHeight: number;
    overscanPx?: number;
}): FeedWindow => {
    if (count === 0) return { start: 0, end: 0 };
    const lo = Math.max(0, scrollTop - overscanPx);
    const hi = scrollTop + Math.max(0, viewportHeight) + overscanPx;
    let top = 0;
    let start = 0;
    let end = count;
    for (let i = 0; i < count; i++) {
        const bottom = top + Math.max(0, heightOf(i));
        if (bottom <= lo) start = i + 1;
        if (top < hi) end = i + 1;
        top = bottom;
        if (top >= hi && i >= start) break;
    }
    return { start: Math.min(start, count), end: Math.min(Math.max(end, start + 1), count) };
};
