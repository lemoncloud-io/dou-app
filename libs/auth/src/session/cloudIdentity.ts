import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/logger';

import { cloudStore } from '@chatic/session';

export const uidOfCloudToken = (token: UserTokenView): string | null => {
    const view = token as { uid?: string; id?: string };
    return view.uid ?? view.id ?? null;
};

export const recordCloudIdentity = (cloudId: string, cloudToken: UserTokenView): void => {
    const uid = uidOfCloudToken(cloudToken);
    if (!uid) {
        logger.warn('SESSION', '[cloudIdentity] cloud token carries no uid — identity not recorded', {
            data: { cloudId },
        });
        return;
    }
    cloudStore.setCloudIdentity(cloudId, { uid });
};
