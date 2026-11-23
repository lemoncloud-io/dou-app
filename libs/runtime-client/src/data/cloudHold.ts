import type { PageRepositories } from '@chatic/runtime-core';

import { getCloudRepositories, holdCloud } from './dataCommands';

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
