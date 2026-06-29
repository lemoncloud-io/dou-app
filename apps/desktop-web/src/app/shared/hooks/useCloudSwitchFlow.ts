import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useLoaderStore } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    reportError,
    useLogoutCloudSession,
    useSessionSelection,
    useSiteSwitch,
    useSwitchCloudSession,
} from '@chatic/web-core';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainSite } from '@chatic/data';

import { useSelectedChannelStore, useSelectedPlaceStore } from '../stores';
import { toError } from '../utils';

interface UseCloudSwitchFlowOptions {
    onPlaceSelected?: (placeId: string) => void;
}

/** Saved place if still present in the new cloud, else the first place. */
const resolveTargetPlace = (places: DomainSite[], savedPlaceId: string | null): string | null => {
    if (places.length === 0) return null;
    if (savedPlaceId && places.some(p => p.id === savedPlaceId)) return savedPlaceId;
    return places[0].id;
};

/**
 * Cloud switch pipeline (mirrors apps/web): switch the cloud session → fetch the new cloud's
 * places → switch into the target place. The v2 `switchCloud`/`switchSite` services own the
 * optimistic cid/sid pre-apply and rollback-on-failure internally (a failed switch leaves the
 * previous cloud session intact), so this hook no longer drives token exchange or manual
 * rollback — it only sequences the steps and surfaces the desktop loader / place selection.
 *
 * Returning to the Default Cloud has no delegation token to exchange, so it goes through
 * `logoutCloudSession` (drop the cloud session, fall back to relay) rather than `switchCloud`.
 */
export const useCloudSwitchFlow = (options: UseCloudSwitchFlowOptions = {}) => {
    const { switchCloud: switchCloudSession } = useSwitchCloudSession();
    const { logoutCloudSession } = useLogoutCloudSession();
    const { switchSite } = useSiteSwitch();
    const { selectedCloudId } = useSessionSelection();
    const { place: placeRepository, channel: channelRepository } = useRuntimeRepositories();
    const setIsLoading = useLoaderStore(s => s.setIsLoading);
    const { t } = useTranslation();
    const { toast } = useToast();
    const switchingRef = useRef(false);

    const showError = (key: string, error: unknown) => {
        logger.error('SESSION', `[CloudSwitchFlow] ${key}`, { error });
        reportError(toError(error));
        toast({ title: t('cloud.switchFailed'), variant: 'destructive' });
    };

    const switchCloud = useCallback(
        async (cloudId: string) => {
            if (switchingRef.current) return;
            if (cloudId === selectedCloudId) return;
            switchingRef.current = true;

            // Drop the previous cloud's channel selection up front: channel ids are
            // cloud-scoped, and any hook still keyed on the stale id would fire
            // cross-cloud requests (e.g. channel.list-user → 403) at the new socket.
            useSelectedChannelStore.getState().clearChannel();

            setIsLoading(true, t('cloud.switching'));
            try {
                // Returning to the Default Cloud: drop the cloud session and fall back to relay.
                if (cloudId === 'default') {
                    await logoutCloudSession();
                    options.onPlaceSelected?.('default');
                    return;
                }

                // switchCloud commits the new cloud token (and rolls back on failure). Invited
                // clouds enter via the same path — the local cache holds the real target cid.
                await switchCloudSession(cloudId);

                // The new cloud token is committed, so this signed request is scoped to it.
                await placeRepository.refreshList().catch(() => undefined);
                const cached = await placeRepository.cacheReadList();
                const places = (cached?.list ?? []) as DomainSite[];

                const savedPlaceId = useSelectedPlaceStore.getState().selectedPlaceId;
                const targetPlaceId = resolveTargetPlace(places, savedPlaceId);
                if (targetPlaceId) {
                    await switchSite(targetPlaceId);
                    options.onPlaceSelected?.(targetPlaceId);

                    void channelRepository
                        .refreshList({ sid: targetPlaceId })
                        .catch(e => logger.error('SESSION', '[CloudSwitchFlow] bg refreshChannels failed', { error: e }));
                }
            } catch (e) {
                // switchCloud / switchSite already rolled their own session back on failure.
                showError('switchFailed', e);
            } finally {
                switchingRef.current = false;
                setIsLoading(false);
            }
        },
        [
            switchCloudSession,
            logoutCloudSession,
            switchSite,
            selectedCloudId,
            placeRepository,
            channelRepository,
            setIsLoading,
            t,
            toast,
            options.onPlaceSelected,
        ]
    );

    return { switchCloud };
};
