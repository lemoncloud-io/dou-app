import type { DataContext } from '@chatic/data';

import { getGlobalSessionContext } from '../store';

export const deriveSelectedContext = (): DataContext => {
    const { cloud, identity } = getGlobalSessionContext();

    const selectedCloudId = cloud?.cloudId ?? undefined;

    return {
        cid: selectedCloudId && selectedCloudId !== 'default' ? selectedCloudId : 'default',
        uid: identity.userId ?? undefined,
    };
};
