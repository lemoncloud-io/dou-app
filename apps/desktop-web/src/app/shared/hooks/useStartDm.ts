import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { RELAY_CLOUD_ID, type DomainChannel, runtime } from '@chatic/runtime';
import { logger } from '@chatic/bridges';

import { usePendingOpenStore } from '../stores';
import { liveSelection, switchesSettled } from './switchesSettled';
import { toastFailure } from '../utils';

type Repositories = ReturnType<typeof runtime.data.useRuntimeRepositories>;

const syncCloudChannels = async (
    channelRepository: Repositories['channel'],
    syncMeta: Repositories['syncMeta'],
    cloudId: string
): Promise<void> => {
    const kind = `channel-sync:${cloudId}`;
    try {
        const { syncedAt } = await channelRepository.syncChannels(await syncMeta.getSyncedAt(kind));
        await syncMeta.setSyncedAt(kind, syncedAt);
    } catch (error) {
        logger.warn('CHANNEL', '[useStartDm] channel sync after start failed', { error });
    }
};

export const useStartDm = () => {
    const { t } = useTranslation();
    const { channel: channelRepository, syncMeta } = runtime.data.useRuntimeRepositories();
    const cloudId = runtime.session.useGlobalSession().cloud.cloudId;
    const isAvailable = !!cloudId && cloudId !== RELAY_CLOUD_ID;
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const queryClient = useQueryClient();

    const cloudIdRef = useRef(cloudId);
    cloudIdRef.current = cloudId;
    const placeIdRef = useRef(selectedSiteId);
    placeIdRef.current = selectedSiteId;
    const inFlightRef = useRef(false);
    const [isStarting, setIsStarting] = useState(false);

    const open = useCallback(
        async (kind: 'dm' | 'self', request: () => Promise<DomainChannel>): Promise<DomainChannel | null> => {
            if (inFlightRef.current) return null;
            const startedIn = cloudIdRef.current;
            const startedAt = placeIdRef.current;
            inFlightRef.current = true;
            setIsStarting(true);
            try {
                if (kind === 'dm') {
                    await switchesSettled(queryClient);
                    const now = liveSelection();
                    if (now.cloudId !== startedIn || now.placeId !== startedAt) return null;
                }
                const room = await request();
                if (!room?.id) throw new Error('[useStartDm] the room came back without an id');
                if (cloudIdRef.current !== startedIn) return null;
                if (kind === 'dm' && room.sid && startedAt && room.sid !== startedAt) {
                    logger.warn('CHANNEL', '[useStartDm] the room is in another place than it was asked from', {
                        startedAt,
                        roomPlaceId: room.sid,
                    });
                }
                usePendingOpenStore
                    .getState()
                    .request({ placeId: kind === 'dm' ? room.sid || '' : '', channelId: room.id });
                if (!room.sid && startedIn) void syncCloudChannels(channelRepository, syncMeta, startedIn);
                return room;
            } catch (error) {
                logger.error('CHANNEL', '[useStartDm] start failed', { kind, cloudId: startedIn, error });
                toastFailure(t('dm.start.failed'), error);
                return null;
            } finally {
                inFlightRef.current = false;
                setIsStarting(false);
            }
        },
        [channelRepository, syncMeta, queryClient, t]
    );

    const startDm = useCallback(
        (peerId: string): Promise<DomainChannel | null> =>
            isAvailable && peerId ? open('dm', () => channelRepository.startDm({ peerId })) : Promise.resolve(null),
        [open, channelRepository, isAvailable]
    );

    const canOpenSelf = isAvailable && !!selectedSiteId;
    const openSelf = useCallback(
        (): Promise<DomainChannel | null> =>
            isAvailable && selectedSiteId
                ? open('self', () => channelRepository.getSelfChannel(undefined, selectedSiteId))
                : Promise.resolve(null),
        [open, channelRepository, isAvailable, selectedSiteId]
    );

    return { startDm, openSelf, isStarting, isAvailable, canOpenSelf };
};
