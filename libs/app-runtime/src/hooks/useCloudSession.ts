import { useEffect, useRef } from 'react';
import { logger } from '@chatic/bridges';
import { useIssueCloudToken } from '@chatic/auth';

import { useClouds } from '@chatic/users';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { UserProfile$, UserView } from '@lemoncloud/chatic-backend-api';
import { useWebSocketV2Store } from '../socket';

/**
 * Merge a cloud token's user fields onto the signed-in profile WITHOUT collapsing
 * the canonical identity. The cloud token is a flat `UserView` (id/name/…), not a
 * `UserProfile$` — so when `current` is absent (boot auto-select race, first login)
 * a naive `{...current, ...cloudUser}` yields a UserView with no `uid`/`$user`, and
 * every profile surface renders "-" until a hard refresh re-fetches the full profile.
 * Always derive a structured `uid`/`$user` so that never happens.
 */
const mergeCloudProfile = (current: UserProfile$ | null, cloudUser: Partial<UserView>): UserProfile$ =>
    ({
        ...current,
        ...cloudUser,
        uid: current?.uid ?? (cloudUser as { id?: string }).id,
        $user: current?.$user ?? (cloudUser as unknown as UserView),
    }) as unknown as UserProfile$;

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
                cloudCore.clearPlaceOrder(cloudId);
            }

            const currentProfile = useWebCoreStore.getState().profile;
            const { Token: _Token, ...cloudProfile } = userToken;
            setProfile(mergeCloudProfile(currentProfile, cloudProfile));

            // WebSocket store의 cloudId 업데이트 → usePlaces 등 데이터 훅이 재실행
            useWebSocketV2Store.getState().setCloudId(cloudId);

            // WebSocket에 새 cloud 인증 정보 전달
            // useCloudTokenRefresh가 isVerified=false를 감지하여 auth:update 발송
            useWebSocketV2Store.getState().setIsVerified(false);
        } catch (e) {
            logger.error('SESSION', '[useCloudSession] selectCloud failed', { error: e });
            throw e;
        }
    };

    // Re-enter an invite-joined cloud by replaying the session captured at
    // invite-login. The home broker's delegate-cloud 404s for invited clouds
    // (they aren't in view=mine), so selectCloud can't be used — instead restore
    // the saved delegation + cloud token and re-run the socket auth handshake.
    const restoreInvitedCloud = async (cloudId: string) => {
        try {
            if (
                !(
                    cloudCore as typeof cloudCore & { applyInvitedCloud?: (cloudId: string) => boolean }
                ).applyInvitedCloud?.(cloudId)
            ) {
                throw new Error(`No invited-cloud session for ${cloudId}`);
            }

            const cloudToken = cloudCore.getCloudToken();
            if (cloudToken) {
                const currentProfile = useWebCoreStore.getState().profile;
                const { Token: _Token, ...cloudProfile } = cloudToken;
                setProfile(mergeCloudProfile(currentProfile, cloudProfile));
            }

            // Land back on the invited place the bundle was captured with, then
            // re-run the auth handshake (mirrors selectCloud's tail).
            const siteId = cloudCore.getSelectedPlaceId();
            useWebSocketV2Store.getState().setCloudId(cloudId);
            if (siteId) useWebSocketV2Store.getState().setSelectedPlaceId(siteId);
            useWebSocketV2Store.getState().setIsVerified(false);
        } catch (e) {
            logger.error('SESSION', '[useCloudSession] restoreInvitedCloud failed', { error: e });
            throw e;
        }
    };

    return {
        selectCloud,
        restoreInvitedCloud,
        isPending,
        clouds,
        isCloudsError,
        isFetchingClouds: isFetching,
        refetchClouds: refetch,
    };
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
                useWebSocketV2Store.getState().setCloudId('default');
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
