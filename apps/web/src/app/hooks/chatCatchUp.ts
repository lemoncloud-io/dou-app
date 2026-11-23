export const CATCH_UP_LIMIT = 30;

export const CATCH_UP_OLDER_LIMIT = 50;

export const CATCH_UP_MAX_OLDER_PAGES = 5;

export const CATCH_UP_OLDER_CONCURRENCY = 2;

export interface CatchUpPage {
    cursorNo?: number;
}

export interface CatchUpInput {
    knownNo: number;
    fetchNewest: () => Promise<CatchUpPage>;
    fetchOlder: (cursorNo: number, limit: number) => Promise<CatchUpPage>;
    shouldContinue: () => boolean;
}

export interface CatchUpResult {
    olderPages: number;
    reachedCache: boolean;
}

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
        if (next !== 0 && next >= cursorNo) return { olderPages, reachedCache: false };
        cursorNo = next;
    }
    return { olderPages, reachedCache: meetsCache(cursorNo) };
};

export type PageGate = <T>(task: () => Promise<T>) => Promise<T>;

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
