/**
 * Resolve which cloud an FCM push belongs to WITHOUT `data.cid` (the deployed
 * backends can't stamp it — confirmed live: the field arrives as `""`). The
 * engine's IndexedDB cache partitions every record by cloud (`cid`), and any
 * cloud the user is a member of has been visited at least once (joining
 * requires it) — so its channels are cached. Reverse-lookup the push's channel
 * across partitions.
 *
 * Channel ids are per-cloud sequential numbers, so a bare channelId can
 * collide across clouds: narrow by `sid` (place) and `channelName`, and return
 * a cloud only on a UNIQUE match — no badge beats a wrong badge.
 *
 * Reads the engine cache directly (read-only): the repository layer is scoped
 * to the ACTIVE cloud's partition and exposes no cross-partition query, and
 * this stays a desktop-web-local concern until the backend can ship `cid`
 * (when it does, the badge hook prefers `cid` and this never runs).
 */
const DB_NAME = 'ChaticWebCacheDB';
const STORE_NAME = 'cache_store';

interface CachedRecord {
    type?: string;
    cid?: string;
    data?: { id?: string; sid?: string; name?: string };
}

export interface PushChannelHint {
    channelId?: string;
    sid?: string;
    channelName?: string;
}

export const resolvePushCloudId = async (hint: PushChannelHint): Promise<string | null> => {
    const channelId = hint.channelId;
    if (!channelId || typeof indexedDB === 'undefined') return null;
    try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            const records = await new Promise<CachedRecord[]>((resolve, reject) => {
                const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
                request.onsuccess = () => resolve(request.result ?? []);
                request.onerror = () => reject(request.error);
            });

            let candidates = records.filter(r => r.type === 'channel' && r.data?.id === channelId);
            // Each narrowing filter only applies when it leaves at least one
            // candidate — a stale cached name must not erase a true match.
            if (hint.sid) {
                const bySid = candidates.filter(r => r.data?.sid === hint.sid);
                if (bySid.length > 0) candidates = bySid;
            }
            if (hint.channelName) {
                const byName = candidates.filter(r => r.data?.name === hint.channelName);
                if (byName.length > 0) candidates = byName;
            }

            const cloudIds = [...new Set(candidates.map(r => r.cid).filter(Boolean))] as string[];
            return cloudIds.length === 1 ? cloudIds[0] : null;
        } finally {
            db.close();
        }
    } catch {
        return null; // cache unavailable → degrade to no badge
    }
};
