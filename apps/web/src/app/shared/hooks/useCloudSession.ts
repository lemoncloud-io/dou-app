import { useEffect, useRef } from 'react';
import { useIssueCloudToken } from '@chatic/auth';
import { useWebSocketV2Store } from '@chatic/socket';

import { useClouds } from '@chatic/users';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

export const getCloudSession = () => {
    const wss = cloudCore.getWss();
    const identityToken = cloudCore.getIdentityToken();
    const backend = cloudCore.getBackend();
    if (!wss || !identityToken || !backend) return null;
    return { wss, identityToken, backend };
};

export const clearCloudSession = (): void => {
    cloudCore.clearSession();
};

export const useCloudSession = () => {
    const { mutateAsync: issueCloudToken, isPending } = useIssueCloudToken();
    const { isAuthenticated, setProfile } = useWebCoreStore();
    const { data, isError: isFetchError, isFetching, refetch } = useClouds({ limit: -1, enabled: isAuthenticated });

    const clouds = data?.list ?? [];
    const isCloudsError = !isFetching && isFetchError;

    const selectCloud = async (cloudId: string) => {
        try {
            const previousCloudId = cloudCore.getSelectedCloudId();
            const { cloudDelegationToken, userToken } = await issueCloudToken(cloudId);

            cloudCore.saveDelegationToken(cloudDelegationToken);
            // 같은 cloud 재선택 시 로컬 커스텀 필드(thumbnail 등) 보존
            const existingToken = previousCloudId === cloudId ? cloudCore.getCloudToken() : null;
            cloudCore.saveCloudToken(
                existingToken ? ({ ...existingToken, ...userToken } as typeof userToken) : userToken
            );
            cloudCore.saveSelectedCloudId(cloudId);

            // cloud가 변경된 경우에만 place 초기화 (같은 cloud 재선택 시 place 유지)
            if (previousCloudId !== cloudId) {
                cloudCore.clearSelectedPlace();
            }

            const currentProfile = useWebCoreStore.getState().profile;
            const { Token: _Token, ...cloudProfile } = userToken;
            setProfile({ ...currentProfile, ...cloudProfile } as unknown as UserProfile$);

            // WebSocket store의 cloudId 업데이트 → usePlaces 등 데이터 훅이 재실행
            useWebSocketV2Store.getState().setCloudId(cloudId);

            // WebSocket에 새 cloud 인증 정보 전달
            // useCloudTokenRefresh가 isVerified=false를 감지하여 auth:update 발송
            useWebSocketV2Store.getState().setIsVerified(false);
        } catch (e) {
            console.error('[useCloudSession] selectCloud failed:', e);
            throw e;
        }
    };

    return { selectCloud, isPending, clouds, isCloudsError, isFetchingClouds: isFetching, refetchClouds: refetch };
};

export const useAutoSelectCloud = () => {
    const { clouds, selectCloud, isFetchingClouds } = useCloudSession();
    const { isAuthenticated, isInvited } = useWebCoreStore();
    const autoSelectedRef = useRef(false);

    useEffect(() => {
        if (autoSelectedRef.current) return;
        if (!isAuthenticated) return;

        // If clouds fetch is done but list is empty, set default (only if no existing selection)
        if (!isFetchingClouds && clouds.length === 0) {
            const currentCloudId = cloudCore.getSelectedCloudId();
            if (!currentCloudId) {
                cloudCore.saveSelectedCloudId('default');
                autoSelectedRef.current = true;
            }
            return;
        }

        const activeCloud = clouds.find(c => c.status === 'active');
        if (!activeCloud) return;

        // Skip if user explicitly chose default (relay) mode
        const currentCloudId = cloudCore.getSelectedCloudId();
        if (currentCloudId === 'default') return;

        // Skip if already have a valid cloud session with a cloud that still exists
        // 초대 유저의 경우 초대 cloud가 내 clouds 목록에 없으므로 isInvited도 체크
        const existingSession = getCloudSession();
        const currentCloudExists = clouds.some(c => c.id === currentCloudId);
        if (existingSession && currentCloudId && (currentCloudExists || isInvited)) return;

        autoSelectedRef.current = true;
        void selectCloud(activeCloud.id as string);
    }, [clouds, isAuthenticated, isFetchingClouds, isInvited]);
};
