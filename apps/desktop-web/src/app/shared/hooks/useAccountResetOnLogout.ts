import { useCallback } from 'react';

import { runtime } from '@chatic/runtime-react';
import { deviceStore, plainStore } from '../../storage';

import { CLOUD_RECORD_OWNER_KEY } from '../utils/cloudRecordOwnership';

const ACCOUNT_SCOPED_STORAGE_KEYS = [
    'chatic-my-cloud-uid',
    'chatic-cloud-push-badges',
    'chatic-notification-prefs',
    'chatic-saved-items',
    'chatic-favorite-channels',
    'chatic-mentions',
    'chatic-my-threads',
    'chatic-site-profile-cursor',
    'chatic-selected-channel',
    'chatic-known-channels',
    'chatic-last-channel',
    'chatic-signin-notice',
    CLOUD_RECORD_OWNER_KEY,
] as const;

const clearAllButInvitedClouds = async (cloud: runtime.data.PageRepositories['cloud']): Promise<void> => {
    const rows = (await cloud.cacheReadList())?.list ?? [];
    await Promise.all(
        rows.filter(row => row.id && row.cloudType !== 'invited').map(row => cloud.cacheDelete(row.id as string))
    );
};

export const useAccountResetOnLogout = () => {
    const repos = runtime.data.useRuntimeRepositories();

    const resetAccount = useCallback(async (): Promise<void> => {
        ACCOUNT_SCOPED_STORAGE_KEYS.forEach(key => {
            deviceStore.remove(key);
            plainStore.remove(key);
        });
        runtime.settings.clear('ui.pinnedChannels', { lane: 'local' });
        runtime.settings.clear('ui.channelOrder', { lane: 'local' });
        runtime.settings.clear('ui.railOrder', { lane: 'local' });
        await Promise.all([
            repos.channel.cacheClear(),
            repos.chat.cacheClear(),
            clearAllButInvitedClouds(repos.cloud),
            repos.join.cacheClear(),
            repos.profile.cacheClear(),
            repos.place.cacheClear(),
            repos.user.cacheClear(),
        ]).catch(() => undefined);
    }, [repos]);

    return { resetAccount };
};
