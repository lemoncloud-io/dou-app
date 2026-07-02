// Per-cloud unread snapshot (cid → count) persisted in localStorage.
//
// The home page can only observe the ACTIVE cloud's channels, so an inactive cloud's dot has no
// live source. We write-through the active cloud's total whenever it changes and read the map back
// to light dots on other clouds — best-effort presence: a cloud shows a dot from its last-visited
// total, and unvisited clouds simply have no entry (no dot) until first visited.

const STORAGE_KEY = 'testbed-cloud-unread';

export type CloudUnreadSnapshot = Record<string, number>;

// Minimal storage surface so tests can inject a fake without a DOM.
export interface SnapshotStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const resolveStorage = (storage?: SnapshotStorage): SnapshotStorage | null =>
    storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);

export const readCloudUnreadSnapshot = (storage?: SnapshotStorage): CloudUnreadSnapshot => {
    const store = resolveStorage(storage);
    if (!store) return {};
    try {
        const raw = store.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        // Guard against a malformed/legacy value — only accept a plain object of numbers.
        return parsed && typeof parsed === 'object' ? (parsed as CloudUnreadSnapshot) : {};
    } catch {
        return {};
    }
};

// Records `count` for `cid` (removing the entry at 0 so the map stays sparse) and returns the new
// snapshot. Returns the previous snapshot unchanged when nothing would change, so callers can skip
// redundant state updates/writes.
export const writeCloudUnread = (cid: string, count: number, storage?: SnapshotStorage): CloudUnreadSnapshot => {
    const current = readCloudUnreadSnapshot(storage);
    const existing = current[cid] ?? 0;
    if (existing === count) return current;

    const next: CloudUnreadSnapshot = { ...current };
    if (count > 0) next[cid] = count;
    else delete next[cid];

    const store = resolveStorage(storage);
    if (store) {
        try {
            store.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            // best-effort: a full/blocked storage just means dots fall back to live-only
        }
    }
    return next;
};
