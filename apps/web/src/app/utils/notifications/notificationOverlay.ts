import { threadKey, threadRootNo, type NotificationItem } from './notificationModel';

export const NOTIFICATION_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export type NotificationItems = Record<string, NotificationItem>;

export interface OverlayEntry {
    state: 'read' | 'deleted';
    at: number;
    prior?: 'read';
    no?: number;
}

export interface ThreadReadPoint {
    no: number;
    at: number;
}

export interface NotificationOverlay {
    entries: Record<string, OverlayEntry>;
    threads: Record<string, ThreadReadPoint>;
    baselineAt: number;
}

export const freshOverlay = (now: number): NotificationOverlay => ({ entries: {}, threads: {}, baselineAt: now });

export const EMPTY_OVERLAY: NotificationOverlay = freshOverlay(0);

const threadKeyOf = (item: NotificationItem): string | undefined =>
    item.parentId ? threadKey(item.cloudId, item.channelId, threadRootNo(item.parentId)) : undefined;

const entryFor = (overlay: NotificationOverlay, item: NotificationItem): OverlayEntry | undefined => {
    const entry = overlay.entries[item.id];
    return entry && (entry.no === undefined || entry.no === item.chatNo) ? entry : undefined;
};

export const applyOverlay = (
    computed: NotificationItems,
    overlay: NotificationOverlay,
    cutoff: number
): NotificationItems => {
    const items: NotificationItems = {};
    for (const [id, item] of Object.entries(computed)) {
        if (item.createdAt < cutoff) continue;
        const entry = entryFor(overlay, item);
        if (entry?.state === 'deleted') continue;
        const key = threadKeyOf(item);
        const threadRead = key
            ? item.createdAt < overlay.baselineAt || (item.chatNo ?? 0) <= (overlay.threads[key]?.no ?? 0)
            : false;
        const read = item.read || entry?.state === 'read' || threadRead;
        items[id] = read === item.read ? item : { ...item, read };
    }
    return items;
};

export interface OverlayChange<T> {
    overlay: NotificationOverlay;
    changed: T[];
}

export const markReadIn = (
    overlay: NotificationOverlay,
    items: NotificationItems,
    ids: readonly string[]
): OverlayChange<string> => {
    const changed = ids.filter(id => items[id] && !items[id].read);
    if (changed.length === 0) return { overlay, changed };
    const entries = { ...overlay.entries };
    for (const id of changed) entries[id] = { state: 'read', at: items[id].createdAt, no: items[id].chatNo };
    return { overlay: { ...overlay, entries }, changed };
};

export const markUnreadIn = (overlay: NotificationOverlay, ids: readonly string[]): NotificationOverlay => {
    const held = ids.filter(id => overlay.entries[id]?.state === 'read');
    if (held.length === 0) return overlay;
    const entries = { ...overlay.entries };
    for (const id of held) delete entries[id];
    return { ...overlay, entries };
};

export const removeIn = (
    overlay: NotificationOverlay,
    items: NotificationItems,
    ids: readonly string[]
): OverlayChange<NotificationItem> => {
    const changed = ids.map(id => items[id]).filter((item): item is NotificationItem => !!item);
    if (changed.length === 0) return { overlay, changed };
    const entries = { ...overlay.entries };
    for (const item of changed) {
        const prior = entryFor(overlay, item)?.state === 'read' ? ('read' as const) : undefined;
        entries[item.id] = { state: 'deleted', at: item.createdAt, no: item.chatNo, ...(prior ? { prior } : {}) };
    }
    return { overlay: { ...overlay, entries }, changed };
};

export const restoreIn = (overlay: NotificationOverlay, removed: readonly NotificationItem[]): NotificationOverlay => {
    const held = removed.filter(item => overlay.entries[item.id]?.state === 'deleted');
    if (held.length === 0) return overlay;
    const entries = { ...overlay.entries };
    for (const item of held) {
        const entry = entries[item.id];
        if (entry.prior === 'read') entries[item.id] = { state: 'read', at: entry.at, no: entry.no };
        else delete entries[item.id];
    }
    return { ...overlay, entries };
};

export const markThreadReadIn = (
    overlay: NotificationOverlay,
    items: NotificationItems,
    cloudId: string,
    channelId: string,
    rootNo: string
): NotificationOverlay => {
    const key = threadKey(cloudId, channelId, rootNo);
    let no = 0;
    let at = 0;
    for (const item of Object.values(items)) {
        if (threadKeyOf(item) !== key) continue;
        no = Math.max(no, item.chatNo ?? 0);
        at = Math.max(at, item.createdAt);
    }
    const held = overlay.threads[key];
    if (no === 0 || (held && held.no >= no)) return overlay;
    return { ...overlay, threads: { ...overlay.threads, [key]: { no, at: Math.max(at, held?.at ?? 0) } } };
};

export const pruneOverlay = (overlay: NotificationOverlay, cutoff: number): NotificationOverlay => {
    const staleEntries = Object.keys(overlay.entries).filter(id => overlay.entries[id].at < cutoff);
    const staleThreads = Object.keys(overlay.threads).filter(key => overlay.threads[key].at < cutoff);
    if (staleEntries.length === 0 && staleThreads.length === 0) return overlay;
    const entries = { ...overlay.entries };
    const threads = { ...overlay.threads };
    for (const id of staleEntries) delete entries[id];
    for (const key of staleThreads) delete threads[key];
    return { ...overlay, entries, threads };
};
