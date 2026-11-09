import { runtimeMedia } from '../storage/runtimeMedia';

/**
 * The instant before which no sync cursor is trusted, and the hand-off that moves it after a cache
 * clear.
 *
 * Clearing the cache removes the cursors with the data, but a sync already in flight can land after
 * that and save a fresh cursor over the emptied store — "synced up to T2" with nothing behind it, so
 * every later sync asks only for the delta after T2 and the rooms from before never come back. The
 * page reloads right after the clear, and anything the old page saved is stamped before it unloads.
 * So the NEW page, as it boots, records its own start time as the watermark, and every cursor from
 * before it retires to a full re-sync.
 *
 * It is set at boot and not by the clear itself because the clear's own clock cannot see the in-flight
 * write: it lands after the clear finishes. And it is a watermark rather than a second sweep at boot
 * because clearing at boot means building the data runtime before the native shell has said which
 * cache types it can store, which would fix the routing wrongly for the whole session.
 *
 * Kept in the runtime's `device` medium (`localStorage`) under a key the logout sweep never clears — a
 * watermark from before a logout is still true about the cursors it covers. The medium is tolerant, so a
 * failed write does not throw: the pending request is consumed only once the watermark reads back, and a
 * full storage leaves it for the next boot to try again.
 */
const PENDING_KEY = 'chatic.syncCursors.resetPending';
const VALID_AFTER_KEY = 'chatic.syncCursors.validAfter';

/** Called by the clear: the next boot is to retire every cursor saved before it. */
export const requestSyncCursorReset = (): void => {
    runtimeMedia.device().set(PENDING_KEY, '1');
};

/**
 * Called once at boot, before anything can read or save a cursor. A pending reset becomes the
 * watermark and is consumed, so the watermark moves exactly once per clear.
 */
export const applyPendingSyncCursorReset = (now: number = Date.now()): void => {
    const store = runtimeMedia.device();
    if (store.get(PENDING_KEY) !== '1') return;
    store.set(VALID_AFTER_KEY, String(now));
    if (store.get(VALID_AFTER_KEY) !== String(now)) return;
    store.remove(PENDING_KEY);
};

/** The current watermark, read at call time. 0 when no clear has ever asked for one. */
export const getSyncCursorsValidAfter = (): number => {
    const value = Number(runtimeMedia.device().get(VALID_AFTER_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
};
