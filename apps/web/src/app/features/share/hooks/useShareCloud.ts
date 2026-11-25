import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime, RELAY_CLOUD_ID } from '@chatic/runtime-react';
import { logger } from '@chatic/bridges';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useActiveCloudPlaces, useCachedCloudNames, useCloudSessionCatalog, useInvitedClouds } from '../../../hooks';
import { cloudDisplayName } from '../../../utils';

const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

export interface ShareOption {
    id: string;
    name: string;
}

export const useShareCloud = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const { switchCloud } = runtime.session.useSwitchCloudSession();
    const { switchSite } = runtime.session.useSiteSwitch();
    const { clouds: catalog } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    const cachedNames = useCachedCloudNames();
    const { places, isLoading: isPlacesLoading } = useActiveCloudPlaces();

    const [isSwitching, setIsSwitching] = useState(false);
    const inFlightRef = useRef(false);

    const clouds = useMemo<ShareOption[]>(() => {
        const rows: ShareOption[] = [{ id: RELAY_CLOUD_ID, name: t('cloudSessionSheet.douHome') }];
        for (const cloud of [...catalog, ...invitedClouds]) {
            if (!cloud.id || cloud.status === 'reserved' || cloud.status === 'init') continue;
            if (rows.some(row => row.id === cloud.id)) continue;
            rows.push({ id: cloud.id, name: cachedNames[cloud.id] ?? (cloudDisplayName(cloud) || cloud.id) });
        }
        return rows;
    }, [catalog, invitedClouds, cachedNames, t]);

    const placeOptions = useMemo<ShareOption[]>(
        () => places.map(place => ({ id: place.id, name: place.name?.trim() || place.id })),
        [places]
    );

    const run = useCallback(
        async (event: string, target: string, work: () => Promise<unknown>): Promise<boolean> => {
            if (inFlightRef.current) return false;
            inFlightRef.current = true;
            setIsSwitching(true);
            try {
                await work();
                return true;
            } catch (error) {
                logger.warn('cloud.share_switch_failed', `share: ${event} failed`, { error, target });
                toast({ title: t('share.switchFailed') });
                return false;
            } finally {
                inFlightRef.current = false;
                setIsSwitching(false);
            }
        },
        [toast, t]
    );

    const changeCloud = useCallback(
        (cid: string): Promise<boolean> => {
            if (cid === selectedCloudId) return Promise.resolve(false);
            return run('cloud switch', cid, async () => {
                const verified = await runtime.connection.waitUntilVerified(null, HANDSHAKE_WAIT_TIMEOUT_MS);
                if (!verified) throw new Error('socket handshake not verified');
                await switchCloud(cid);
            });
        },
        [selectedCloudId, run, switchCloud]
    );

    const changePlace = useCallback(
        (sid: string): Promise<boolean> => {
            if (sid === selectedSiteId) return Promise.resolve(false);
            return run('place switch', sid, () => switchSite(sid));
        },
        [selectedSiteId, run, switchSite]
    );

    const autoSelectedForRef = useRef<string | null>(null);
    useEffect(() => {
        if (selectedSiteId || isSwitching || isPlacesLoading || places.length === 0) return;
        const cloudKey = selectedCloudId ?? RELAY_CLOUD_ID;
        if (autoSelectedForRef.current === cloudKey) return;
        autoSelectedForRef.current = cloudKey;
        void run('place auto-select', places[0].id, () => switchSite(places[0].id)).then(switched => {
            if (switched && autoSelectedForRef.current === cloudKey) autoSelectedForRef.current = null;
        });
    }, [selectedCloudId, selectedSiteId, isSwitching, isPlacesLoading, places, run, switchSite]);

    return {
        clouds,
        places: placeOptions,
        selectedCloudId: selectedCloudId ?? RELAY_CLOUD_ID,
        selectedPlaceId: selectedSiteId,
        isRelay: (selectedCloudId ?? RELAY_CLOUD_ID) === RELAY_CLOUD_ID,
        isSwitching,
        changeCloud,
        changePlace,
    };
};
