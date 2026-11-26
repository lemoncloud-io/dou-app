import { logger } from '@chatic/logger';
import { RELAY_CLOUD_ID } from '@chatic/data';
import type { DataRepositories } from '@chatic/data';

import { getCommittedCloudId, getRecordedCloudIds } from '@chatic/session';
import { getDataManager } from './runtime';
import { requestSyncCursorReset } from './syncCursorWatermark';

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
    clouds: string[];
    failures: number;
}

const knownCloudIds = (): string[] => {
    const committed = getCommittedCloudId();
    const ids = [RELAY_CLOUD_ID, ...getRecordedCloudIds(), ...(committed ? [committed] : [])];
    return [...new Set(ids)];
};

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
    requestSyncCursorReset();

    logger.info('CACHE', '[clearLocalCaches] done', { data: { clouds: clouds.length, failures } });
    return { clouds, failures };
};
