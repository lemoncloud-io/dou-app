const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const shareStructure = <T>(previous: T, next: T): T => {
    if (Object.is(previous, next)) return previous;
    if (Array.isArray(previous) && Array.isArray(next)) {
        if (previous.length !== next.length) {
            return next.map((item, index) => shareStructure(previous[index], item)) as T;
        }
        let same = true;
        const shared = next.map((item, index) => {
            const kept = shareStructure(previous[index], item);
            if (kept !== previous[index]) same = false;
            return kept;
        });
        return (same ? previous : shared) as T;
    }
    if (isRecord(previous) && isRecord(next)) {
        const keys = Object.keys(next);
        let same = keys.length === Object.keys(previous).length;
        const shared: Record<string, unknown> = {};
        for (const key of keys) {
            const kept = shareStructure(previous[key], next[key]);
            if (!(key in previous) || kept !== previous[key]) same = false;
            shared[key] = kept;
        }
        return (same ? previous : shared) as T;
    }
    return next;
};
