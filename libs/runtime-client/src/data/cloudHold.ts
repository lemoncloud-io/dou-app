import type { PageRepositories } from '@chatic/runtime-core';

import { getCloudRepositories, holdCloud } from './dataCommands';

/**
 * Runs `work` against `cid`'s chat repository while holding that cloud's socket, released when `work`
 * settles — for a write that spans several of the cloud's repository calls with the page's own work
 * between them, such as an image send's uploads. The hold and every request go through the engine;
 * on the phone the session can run in the app's own process, where a hold is something the page asks
 * for and ends.
 *
 * The repository is the room's own cloud's, never the selection's: an upload takes seconds, and a
 * switch in that time would otherwise put the finished message on the next cloud's socket. Async
 * throughout, so a cloud whose graph cannot be read rejects inside the hold, which is released.
 */
export const withCloudHold = async <T>(
    cid: string,
    work: (chat: PageRepositories['chat']) => Promise<T>
): Promise<T> => {
    const release = holdCloud(cid);
    try {
        return await work(getCloudRepositories(cid).chat);
    } finally {
        release();
    }
};
