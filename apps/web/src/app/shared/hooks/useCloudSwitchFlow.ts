import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useLoaderStore } from '@chatic/shared';
import { useWebSocketV2Store } from '@chatic/socket';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudCore, reportError, toError, useWebCoreStore } from '@chatic/web-core';
import type { DomainSite } from '@chatic/data';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { useRepositories } from '../data';
import { useCloudSession } from './useCloudSession';
import { waitForVerified } from '../utils/waitForVerified';
import { setPlaceAuthDone } from '../../features/home/components/PlaceList';

// --- 헬퍼 ---

/**
 * 저장된 place ID가 목록에 있으면 반환, 아니면 첫 번째 place 반환
 */
const resolveTargetPlace = (places: DomainSite[]): string | null => {
    if (places.length === 0) return null;
    const savedPlaceId = useWebSocketV2Store.getState().selectedPlaceId;
    if (savedPlaceId && places.some(p => p.id === savedPlaceId)) {
        return savedPlaceId;
    }
    return places[0].id;
};

/**
 * Place 선택 + token refresh + auth:update 대기
 * PlaceList.handleSelectPlace의 cloud 모드 로직과 동일
 */
const authPlace = async (placeId: string): Promise<void> => {
    const wssType = useWebSocketV2Store.getState().wssType;

    // relay 모드: refreshToken 불필요, 단순 저장만
    if (wssType !== 'cloud') {
        cloudCore.saveSelectedSiteId(placeId);
        useWebSocketV2Store.getState().setSelectedPlaceId(placeId);
        setPlaceAuthDone(true);
        return;
    }

    const cloudToken = cloudCore.getCloudToken();
    const uid = cloudToken?.id;
    if (!uid) throw new Error('No cloud token uid for place auth');

    const target = `${uid}@${placeId}`;
    const refreshed = await cloudCore.refreshToken(target);
    cloudCore.saveSelectedSiteId(placeId);
    useWebSocketV2Store.getState().setSelectedPlaceId(placeId);

    const currentProfile = useWebCoreStore.getState().profile;
    const { Token: _token, ...cloudProfile } = refreshed;
    useWebCoreStore.getState().setProfile({ ...currentProfile, ...cloudProfile } as unknown as UserProfile$);

    // useCloudTokenRefresh가 isVerified=false를 감지하여 auth:update 발송
    useWebSocketV2Store.getState().setIsVerified(false);

    // auth:update 응답 대기
    const ok = await waitForVerified(5000);
    if (!ok) throw new Error('Place auth timeout');

    setPlaceAuthDone(true);
};

// --- Hook ---

interface UseCloudSwitchFlowOptions {
    onPlaceSelected?: (placeId: string) => void;
}

export const useCloudSwitchFlow = (options: UseCloudSwitchFlowOptions) => {
    const { selectCloud } = useCloudSession();
    const { site: siteRepository, channel: channelRepository } = useRepositories();
    const setIsLoading = useLoaderStore(s => s.setIsLoading);
    const { t } = useTranslation();
    const { toast } = useToast();
    const switchingRef = useRef(false);

    const showError = (descriptionKey: string, error: unknown) => {
        logger.error('SESSION', `[CloudSwitchFlow] ${descriptionKey}`, { error });
        reportError(toError(error));
        toast({
            title: t('cloudSessionSheet.switchFailed'),
            description: t(`cloudSessionSheet.${descriptionKey}`),
            variant: 'destructive',
        });
    };

    const rollbackCloud = async (previousCloudId: string | null) => {
        try {
            if (!previousCloudId || previousCloudId === 'default') {
                // default 모드로 복원
                cloudCore.clearDelegationToken();
                cloudCore.saveSelectedCloudId('default');
                useWebSocketV2Store.getState().setCloudId('default');
                useWebSocketV2Store.getState().setIsVerified(false);
            } else {
                // 이전 cloud 재선택
                await selectCloud(previousCloudId);
                await waitForVerified(10_000);
            }
            logger.info('SESSION', '[CloudSwitchFlow] Rollback complete', { data: { previousCloudId } });
        } catch (rollbackError) {
            // 롤백도 실패하면 default로 fallback
            logger.error('SESSION', '[CloudSwitchFlow] Rollback failed, falling back to default', {
                error: rollbackError,
            });
            cloudCore.clearDelegationToken();
            cloudCore.saveSelectedCloudId('default');
            useWebSocketV2Store.getState().setCloudId('default');
            useWebSocketV2Store.getState().setIsVerified(false);
        }
    };

    const switchCloud = useCallback(
        async (cloudId: string) => {
            // 빠른 연속 전환 방지
            if (switchingRef.current) return;
            switchingRef.current = true;

            const previousCloudId = cloudCore.getSelectedCloudId();

            setIsLoading(true, t('globalLoader.switchingCloud'));
            try {
                // Step 1: Cloud 전환 — 토큰 발급 + 스토어 업데이트
                logger.info('SESSION', '[CloudSwitchFlow] Step 1: selectCloud', { data: { cloudId } });
                try {
                    await selectCloud(cloudId);
                } catch (e) {
                    showError('switchFailed', e);
                    throw e;
                }

                // Step 2: 1차 AUTH — WebSocket cloud 인증 완료 대기
                logger.info('SESSION', '[CloudSwitchFlow] Step 2: waitForVerified (cloud auth)');
                const authOk = await waitForVerified(10_000);
                if (!authOk) {
                    const err = new Error('Cloud auth timeout');
                    showError('authTimeout', err);
                    throw err;
                }

                // Step 3: Places 가져오기
                // cache-first: contextHolder가 Zustand subscribe로 이미 새 cid로 업데이트됨
                logger.info('SESSION', '[CloudSwitchFlow] Step 3: fetchPlaces');
                let places: DomainSite[] = [];
                try {
                    const result = await siteRepository.fetchSite({}, { cachePolicy: 'cache-first' });
                    places = (result.list ?? []) as DomainSite[];
                } catch (e) {
                    showError('placeLoadFailed', e);
                    throw e;
                }

                // Step 4: Place 선택 + Token Refresh + 2차 AUTH
                const targetPlaceId = resolveTargetPlace(places);
                logger.info('SESSION', '[CloudSwitchFlow] Step 4: authPlace', {
                    data: { targetPlaceId, placeCount: places.length },
                });
                if (targetPlaceId) {
                    try {
                        await authPlace(targetPlaceId);
                    } catch (e) {
                        showError('placeAuthFailed', e);
                        throw e;
                    }
                    options.onPlaceSelected?.(targetPlaceId);
                }

                // Step 5: Channels — fire-and-forget (useChannels가 이벤트로 자체 갱신)
                if (targetPlaceId) {
                    logger.info('SESSION', '[CloudSwitchFlow] Step 5: fetchChannels (background)');
                    channelRepository
                        .fetchChannel(
                            { sid: targetPlaceId, detail: true, limit: 100, page: 0 },
                            { cachePolicy: 'cache-first' }
                        )
                        .catch(e =>
                            logger.error('SESSION', '[CloudSwitchFlow] Background fetchChannels failed', { error: e })
                        );
                }

                logger.info('SESSION', '[CloudSwitchFlow] Pipeline complete');
            } catch (e) {
                // 실패 시 이전 cloud로 롤백 (Step 1에서 상태가 변경된 경우만)
                const currentCloudId = cloudCore.getSelectedCloudId();
                if (currentCloudId !== previousCloudId) {
                    logger.info('SESSION', '[CloudSwitchFlow] Rolling back to previous cloud', {
                        data: { previousCloudId, currentCloudId },
                    });
                    await rollbackCloud(previousCloudId);
                }
                throw e;
            } finally {
                switchingRef.current = false;
                setIsLoading(false);
            }
        },
        [selectCloud, siteRepository, channelRepository, setIsLoading, t, toast, options.onPlaceSelected]
    );

    return { switchCloud };
};
