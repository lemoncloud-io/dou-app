import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { RELAY_CLOUD_ID } from '@chatic/data';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useActiveCloudPlaces, useCachedCloudNames, useCloudSessionCatalog, useInvitedClouds } from '../../../hooks';
import { cloudDisplayName } from '../../../utils';

/** How long a cloud change waits for the current socket's handshake before it gives up. */
const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

export interface ShareOption {
    id: string;
    name: string;
}

/**
 * The cloud and place a share goes into, and the two rows that change them.
 *
 * A share can only go to the session's own cloud and place: a send rides the session's selected
 * place, so a room elsewhere is reached by moving the session there first — the same switches the
 * cloud sheet and the place list use. Clouds still being provisioned are left out, as the cloud
 * sheet leaves them unselectable.
 */
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

    /**
     * One switch at a time; a failure is said once and leaves the session where it was. Resolves
     * whether the switch went through, so the caller acts on a committed switch only — the session
     * shows the new id while it is still being tried, and goes back to the old one if it fails.
     */
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
                // The switch rides the current socket, so it waits for that socket to be up.
                const verified = await runtime.connection
                    .getSocketManager()
                    .waitUntilVerified(HANDSHAKE_WAIT_TIMEOUT_MS);
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

    // A cloud switch can land with no place selected; home would pick the first one, and the share
    // has no rooms to offer until something does. Tried once per cloud: a failed switch rolls the
    // selection back to none, which would otherwise start the next try — and the next notice — at once.
    // Only a try that went through frees the cloud for another one later. The selection alone cannot
    // say so: a switch shows its target while it runs, the failing one included.
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
        /** The relay has one place, chosen for the person, so it has no place row. */
        isRelay: (selectedCloudId ?? RELAY_CLOUD_ID) === RELAY_CLOUD_ID,
        isSwitching,
        changeCloud,
        changePlace,
    };
};
