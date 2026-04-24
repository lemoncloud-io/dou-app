import { useEffect, useState, useCallback } from 'react';
import { getMobileAppInfo } from '@chatic/app-messages';
import type { InviteCloudView } from '@chatic/app-messages';
import { useWebSocketV2Store } from '@chatic/socket';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import type { AppSyncDetail } from '../sync-events';
import { useInviteLocalDataSource } from '../local/data-sources';

export const useInviteClouds = () => {
    const [inviteClouds, setInviteClouds] = useState<InviteCloudView[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const { isOnMobileApp } = getMobileAppInfo();
    const { cloudId } = useWebSocketV2Store();
    const inviteRepository = useInviteLocalDataSource(cloudId);

    const loadInvites = useCallback(async () => {
        if (!isOnMobileApp) return;

        setIsLoading(true);
        try {
            const data = await inviteRepository.getInvites();
            setInviteClouds(data);
        } catch (error) {
            console.error('Failed to load invites:', error);
        } finally {
            setIsLoading(false);
        }
    }, [isOnMobileApp, inviteRepository]);

    // 마운트 시 최초 불러오기
    useEffect(() => {
        void loadInvites();
    }, [loadInvites]);

    // 저장 이벤트 감지 시 다시 불러오기
    useEffect(() => {
        if (!isOnMobileApp || !cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;
            if (detail.domain === 'invitecloud' && detail.cid === cloudId) {
                void loadInvites();
            }
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [isOnMobileApp, cloudId, loadInvites]);

    return {
        inviteClouds,
        isLoading,
        refresh: loadInvites,
    };
};
