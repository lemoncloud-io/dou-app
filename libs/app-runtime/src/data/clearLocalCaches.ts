import { logger } from '@chatic/bridges';
import { RELAY_CLOUD_ID } from '@chatic/data';
import type { DataRepositories } from '@chatic/data';

import { getCommittedCloudId, getRecordedCloudIds } from '../session/store';
import { getDataManager } from './runtime';
import { requestSyncCursorReset } from './syncCursorWatermark';

/**
 * The repositories whose cache a clear empties — every domain the server refills for what is on
 * screen. `chat` is the one to know about: rows before a room's `joinedNo` are not served again, but
 * they were never shown either (the join-window gate hides them), and `join` is cleared and refilled
 * with it. What does not come back is an unsent message, which lives only here — the dialog says so.
 *
 * Two domains are left out, and both for the same reason: the cache is the only copy.
 * - `cloud` (`invitecloud`) has no server list API. A cleared invited cloud cannot be listed again
 *   until a push happens to name it, so clearing it would drop the user out of clouds they joined.
 * - `invite` carries `dismissedAt`, which only this device ever writes. The server refills the rows
 *   but not that stamp, so every dismissed invite would come back.
 */
const CLEARED_REPOSITORIES = [
    'channel',
    'chat',
    'join',
    'place',
    'profile',
    'user',
] as const satisfies readonly (keyof DataRepositories)[];

type ClearedRepository = (typeof CLEARED_REPOSITORIES)[number] | 'syncMeta';

export interface ClearLocalCachesResult {
    /** Every cloud whose partition was swept, the relay first. */
    clouds: string[];
    /** How many domain clears rejected. Nonzero means some rows are still there. */
    failures: number;
}

/**
 * Every cloud this device can hold a partition for: the relay, every cloud with a recorded uid, and
 * the committed cloud in case its identity has not been recorded yet.
 */
const knownCloudIds = (): string[] => {
    const committed = getCommittedCloudId();
    const ids = [RELAY_CLOUD_ID, ...getRecordedCloudIds(), ...(committed ? [committed] : [])];
    return [...new Set(ids)];
};

/**
 * Empties the local cache of every known cloud, keeping only what the server cannot give back (see
 * `CLEARED_REPOSITORIES`). Sessions and tokens are not touched — this is a cache, not a logout.
 *
 * Each partition is cleared through that cloud's scoped graph, so it runs under the uid the account
 * has there and not the selected one. A failed clear does not stop the others; it is counted and
 * logged, and the caller decides what to tell the user.
 *
 * The sync cursors go last, once that cloud's data clears have settled. A cursor left behind over an
 * emptied store still claims "synced up to T", so the next sync asks only for the delta after T and
 * the gap never fills. Clearing it last covers a data clear that failed (the rows left behind cost
 * only a full re-sync) and a sync that lands while the data is being cleared. A sync that lands after
 * the cursor clear is not covered here — it is why this also asks the next boot to retire every
 * cursor saved before it (`syncCursorWatermark`).
 *
 * Rows written by an account this device is no longer signed in to are not reached: no identity names
 * their uid any more, so there is no partition key to clear them by.
 */
export const clearLocalCaches = async (): Promise<ClearLocalCachesResult> => {
    const clouds = knownCloudIds();
    const manager = getDataManager();

    const perCloud = await Promise.all(
        clouds.map(async cid => {
            const repositories = manager.getScopedRepositories(cid);
            const clearOne = async (name: ClearedRepository): Promise<boolean> => {
                try {
                    await repositories[name].cacheClear();
                    return true;
                } catch (error) {
                    logger.error('CACHE', `[clearLocalCaches] ${name} clear failed`, { error, data: { cid } });
                    return false;
                }
            };
            const data = await Promise.all(CLEARED_REPOSITORIES.map(clearOne));
            const cursors = await clearOne('syncMeta');
            return [...data, cursors].filter(ok => !ok).length;
        })
    );
    const failures = perCloud.reduce((sum, count) => sum + count, 0);
    // Asked whether or not everything cleared: a partial sweep has emptied some stores too.
    requestSyncCursorReset();

    logger.info('CACHE', '[clearLocalCaches] done', { data: { clouds: clouds.length, failures } });
    return { clouds, failures };
};
