/** Size of each older page, once the newest one did not reach what the cache holds. */
export const CATCH_UP_OLDER_LIMIT = 50;

/**
 * Most older pages one head may pull after the newest. Past this a room that gained more while the
 * reader was away keeps a hole below what was pulled, filled when the room is opened and scrolled —
 * as every gap was before catch-up paged at all. Five pages of 50 over the newest page (the server's
 * default of 20) is 270 messages.
 */
export const CATCH_UP_MAX_OLDER_PAGES = 5;

/** How many older pages may be in flight at once, across every room. */
export const CATCH_UP_OLDER_CONCURRENCY = 2;

/** The part of a feed answer the catch-up reads. */
export interface CatchUpPage {
    /**
     * The lowest chat number the page counted, which is the next page's cursor; 0 when the count ran
     * down to the start of what this member may see.
     */
    cursorNo?: number;
}

export interface CatchUpInput {
    /** The newest chat number the cache held when the head was seen to be ahead. */
    knownNo: number;
    /** The room's newest page. */
    fetchNewest: () => Promise<CatchUpPage>;
    /** The `limit` numbers below `cursorNo`. */
    fetchOlder: (cursorNo: number, limit: number) => Promise<CatchUpPage>;
    /** Asked before each older page. False stops the walk: the cloud or the account changed. */
    shouldContinue: () => boolean;
}

export interface CatchUpResult {
    /** Older pages pulled after the newest. */
    olderPages: number;
    /**
     * Whether the pulled pages now meet the cache's newest row, so nothing between it and the head is
     * missing. False when the walk hit its bound, was stopped, or did not walk at all.
     */
    reachedCache: boolean;
}

/**
 * Pulls a room's newest page, and keeps pulling older pages until they meet what the cache already
 * holds — so a room that gained more than one page while the reader was away is not left with a hole
 * between its old rows and its new ones.
 *
 * The server counts a page down from the cursor, `limit` numbers at a time, and returns the lowest
 * number it counted. Rows from that number up to the head are then answered for; everything above
 * `knownNo` is missing until the returned cursor is at or below `knownNo + 1`. A cursor of 0 is the
 * start of history, where there is nothing older to ask for.
 *
 * A room the cache holds nothing of (`knownNo` 0) gets its newest page only: it has no hole, only
 * history, and walking every such room would pull the bound for each one on a fresh install.
 */
export const catchUpChannel = async ({
    knownNo,
    fetchNewest,
    fetchOlder,
    shouldContinue,
}: CatchUpInput): Promise<CatchUpResult> => {
    const newest = await fetchNewest();
    if (knownNo <= 0) return { olderPages: 0, reachedCache: false };
    let cursorNo = newest.cursorNo ?? 0;
    let olderPages = 0;
    const meetsCache = (cursor: number) => cursor === 0 || cursor <= knownNo + 1;

    while (!meetsCache(cursorNo) && olderPages < CATCH_UP_MAX_OLDER_PAGES) {
        if (!shouldContinue()) return { olderPages, reachedCache: false };
        const page = await fetchOlder(cursorNo, CATCH_UP_OLDER_LIMIT);
        olderPages += 1;
        const next = page.cursorNo ?? 0;
        // A cursor that did not move down would ask for the same page again; stop rather than loop.
        if (next !== 0 && next >= cursorNo) return { olderPages, reachedCache: false };
        cursorNo = next;
    }
    return { olderPages, reachedCache: meetsCache(cursorNo) };
};

/** Runs a task when one of the gate's slots is free. */
export type PageGate = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * A gate that lets at most `slots` tasks run at once and queues the rest in order. Every room that fell
 * behind walks at the same moment after a long absence; without it a 40-room place would put its older
 * pages on the socket all together.
 */
export const createPageGate = (slots: number): PageGate => {
    let running = 0;
    const waiting: Array<() => void> = [];
    const release = () => {
        running -= 1;
        waiting.shift()?.();
    };
    return <T>(task: () => Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            const start = () => {
                running += 1;
                task().then(resolve, reject).finally(release);
            };
            if (running < slots) start();
            else waiting.push(start);
        });
};
