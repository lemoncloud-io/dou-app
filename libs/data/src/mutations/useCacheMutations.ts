import { useCallback, useState } from 'react';
import type { CacheType } from '@chatic/app-messages';
import {
    useChannelLocalDataSource,
    useChatLocalDataSource,
    useInviteLocalDataSource,
    useJoinLocalDataSource,
    usePlaceLocalDataSource,
    useUserLocalDataSource,
} from '../local/data-sources';

type CacheMutationAction = 'clear-cache' | 'clear-all-cache';

export const useCacheMutations = (cloudId: string, profileUid?: string) => {
    const [pendingStates, setPendingStates] = useState<Record<CacheMutationAction, boolean>>({
        'clear-cache': false,
        'clear-all-cache': false,
    });

    const channelRepo = useChannelLocalDataSource(cloudId, profileUid);
    const chatRepo = useChatLocalDataSource(cloudId, profileUid);
    const inviteCloudRepo = useInviteLocalDataSource(cloudId);
    const joinRepo = useJoinLocalDataSource(cloudId, profileUid);
    const siteRepo = usePlaceLocalDataSource(cloudId);
    const userRepo = useUserLocalDataSource(cloudId, profileUid);

    const getClearAction = useCallback(
        (type: CacheType): (() => Promise<void>) => {
            switch (type) {
                case 'channel':
                    return channelRepo.clearAll;
                case 'chat':
                    return chatRepo.clearAll;
                case 'user':
                    return userRepo.clearAll;
                case 'join':
                    return joinRepo.clearAll;
                case 'site':
                    return siteRepo.clearAll;
                case 'invitecloud':
                    return inviteCloudRepo.clearAll;
                case 'cloud':
                case 'usertoken':
                default:
                    return async () => {
                        return;
                    };
            }
        },
        [channelRepo, chatRepo, userRepo, joinRepo, siteRepo, inviteCloudRepo]
    );

    /**
     * 특정 단일 캐시 타입 클리어
     */
    const clearCache = useCallback(
        async (type: CacheType): Promise<void> => {
            setPendingStates(prev => ({ ...prev, 'clear-cache': true }));
            try {
                const clearAction = getClearAction(type);
                await clearAction();
            } catch (error) {
                console.error(`Failed to clear cache for type: ${type}`, error);
            } finally {
                setPendingStates(prev => ({ ...prev, 'clear-cache': false }));
            }
        },
        [getClearAction]
    );

    /**
     * 모든 캐시 타입 일괄 클리어
     */
    const clearAllCache = useCallback(async (): Promise<void> => {
        setPendingStates(prev => ({ ...prev, 'clear-all-cache': true }));
        try {
            await Promise.all([
                channelRepo.clearAll(),
                chatRepo.clearAll(),
                userRepo.clearAll(),
                joinRepo.clearAll(),
                siteRepo.clearAll(),
                inviteCloudRepo.clearAll(),
            ]);
        } catch (error) {
            console.error('Failed to clear all caches', error);
        } finally {
            setPendingStates(prev => ({ ...prev, 'clear-all-cache': false }));
        }
    }, [channelRepo, chatRepo, userRepo, joinRepo, siteRepo, inviteCloudRepo]);

    return {
        isPending: pendingStates,
        clearCache,
        clearAllCache,
    };
};
