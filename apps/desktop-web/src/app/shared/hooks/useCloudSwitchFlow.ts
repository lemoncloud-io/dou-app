import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useLoaderStore } from '@chatic/shared';
import { useWebSocketV2Store } from '@chatic/socket';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudCore, reportError, toError } from '@chatic/web-core';
import type { DomainSite } from '@chatic/data';

import { useCloudSession, useRepositories } from '@chatic/app-runtime';
import { authPlace, waitForVerified } from '../utils';

interface UseCloudSwitchFlowOptions {
    onPlaceSelected?: (placeId: string) => void;
}

/** Saved place if still present in the new cloud, else the first place. */
const resolveTargetPlace = (places: DomainSite[]): string | null => {
    if (places.length === 0) return null;
    const savedPlaceId = useWebSocketV2Store.getState().selectedPlaceId;
    if (savedPlaceId && places.some(p => p.id === savedPlaceId)) return savedPlaceId;
    return places[0].id;
};

/**
 * Cloud switch pipeline (ported from apps/web): issue token → wait cloud auth →
 * fetch places → auth target place → background-fetch channels. Rolls back to
 * the previous cloud (or relay default) on any failure.
 */
export const useCloudSwitchFlow = (options: UseCloudSwitchFlowOptions = {}) => {
    const { selectCloud, restoreInvitedCloud } = useCloudSession();
    const { site: siteRepository, channel: channelRepository } = useRepositories();
    const setIsLoading = useLoaderStore(s => s.setIsLoading);
    const { t } = useTranslation();
    const { toast } = useToast();
    const switchingRef = useRef(false);

    const showError = (key: string, error: unknown) => {
        logger.error('SESSION', `[CloudSwitchFlow] ${key}`, { error });
        reportError(toError(error));
        toast({ title: t('cloud.switchFailed'), variant: 'destructive' });
    };

    const rollbackToDefault = () => {
        cloudCore.clearDelegationToken();
        cloudCore.saveSelectedCloudId('default');
        useWebSocketV2Store.getState().setCloudId('default');
        useWebSocketV2Store.getState().setIsVerified(false);
    };

    const rollbackCloud = async (previousCloudId: string | null) => {
        try {
            if (!previousCloudId || previousCloudId === 'default') {
                rollbackToDefault();
            } else {
                await selectCloud(previousCloudId);
                await waitForVerified(10_000);
            }
        } catch (rollbackError) {
            logger.error('SESSION', '[CloudSwitchFlow] Rollback failed → default', { error: rollbackError });
            rollbackToDefault();
        }
    };

    const switchCloud = useCallback(
        async (cloudId: string) => {
            if (switchingRef.current) return;
            switchingRef.current = true;

            const previousCloudId = cloudCore.getSelectedCloudId();
            if (cloudId === previousCloudId) {
                switchingRef.current = false;
                return;
            }

            setIsLoading(true, t('cloud.switching'));
            try {
                // Returning to the Default Cloud has no token to exchange —
                // selectCloud('default') would fail. Clear the delegation and let the
                // socket fall back to relay, then land on the 'default' place.
                if (cloudId === 'default') {
                    rollbackToDefault();
                    await waitForVerified(10_000);
                    options.onPlaceSelected?.('default');
                    return;
                }

                // Invite-joined clouds aren't broker-delegable (delegate-cloud
                // 404s); re-enter them by replaying the captured session instead.
                if (cloudCore.getInvitedCloud(cloudId)) {
                    await restoreInvitedCloud(cloudId);
                } else {
                    await selectCloud(cloudId);
                }

                if (!(await waitForVerified(10_000))) throw new Error('Cloud auth timeout');

                const result = await siteRepository.fetchSite({}, { cachePolicy: 'cache-first' });
                const places = (result.list ?? []) as DomainSite[];

                const targetPlaceId = resolveTargetPlace(places);
                if (targetPlaceId) {
                    await authPlace(targetPlaceId);
                    options.onPlaceSelected?.(targetPlaceId);

                    channelRepository
                        .fetchChannel(
                            { sid: targetPlaceId, detail: true, limit: 100, page: 0 },
                            { cachePolicy: 'cache-first' }
                        )
                        .catch(e => logger.error('SESSION', '[CloudSwitchFlow] bg fetchChannels failed', { error: e }));
                }
            } catch (e) {
                showError('switchFailed', e);
                if (cloudCore.getSelectedCloudId() !== previousCloudId) await rollbackCloud(previousCloudId);
            } finally {
                switchingRef.current = false;
                setIsLoading(false);
            }
        },

        [
            selectCloud,
            restoreInvitedCloud,
            siteRepository,
            channelRepository,
            setIsLoading,
            t,
            toast,
            options.onPlaceSelected,
        ]
    );

    return { switchCloud };
};
