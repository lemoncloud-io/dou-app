import type { MessageRowItem } from '../utils';

export const feedRowKeyOf = (row: MessageRowItem): string => (row.kind === 'group' ? row.group.key : row.key);

export interface FeedWindow {
    start: number;
    end: number;
}

export const FEED_OVERSCAN_PX = 800;

export const FEED_DEFAULT_ESTIMATE_PX = 120;

export const FEED_GAP_PX = 8;

export const MAX_JUMP_WINDOW_RETRIES = 12;
export const JUMP_WINDOW_RETRY_MS = 60;

export const indexOfChatNo = (rows: MessageRowItem[], chatNo: number): number => {
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.kind !== 'group') continue;
        if (row.group.messages.some(message => message.chatNo === chatNo)) return i;
    }
    return -1;
};

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

export interface DayBlock {
    key: string;
    rows: MessageRowItem[];
}

export const groupIntoDayBlocks = (rows: MessageRowItem[]): DayBlock[] => {
    const blocks: DayBlock[] = [];
    for (const row of rows) {
        if (row.kind === 'date' || blocks.length === 0) {
            blocks.push({ key: row.kind === 'date' ? row.key : 'day:lead', rows: [] });
        }
        blocks[blocks.length - 1].rows.push(row);
    }
    return blocks;
};
