import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { runtime, RELAY_CLOUD_ID, type DomainChannel } from '@chatic/runtime';
import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { ROUTES } from '../../../routes/paths';
import { requestBackgroundRefresh } from '../../../runtime/backgroundRefresh';

export interface StartDmOptions {
    replace?: boolean;
}

export interface UseStartDmResult {
    startDm: (peerId: string, options?: StartDmOptions) => Promise<DomainChannel | null>;
    isStarting: boolean;
    isAvailable: boolean;
}

const switchesSettled = (queryClient: QueryClient): Promise<void> =>
    new Promise(resolve => {
        const running = () =>
            queryClient.isMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            queryClient.isMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY });
        if (running() === 0) {
            resolve();
            return;
        }
        const unsubscribe = queryClient.getMutationCache().subscribe(() => {
            if (running() > 0) return;
            unsubscribe();
            resolve();
        });
    });

const liveSelection = (): { cloudId: string | null; placeId: string | null } => {
    const { cloud } = runtime.session.getGlobalSessionContext();
    return { cloudId: cloud.cloudId, placeId: cloud.siteId };
};

export const useStartDm = (): UseStartDmResult => {
    const { t } = useTranslation();
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const navigate = useNavigateWithTransition();
    const queryClient = useQueryClient();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const isAvailable = !!selectedCloudId && selectedCloudId !== RELAY_CLOUD_ID && !!selectedSiteId;

    const cloudIdRef = useRef(selectedCloudId);
    cloudIdRef.current = selectedCloudId;
    const placeIdRef = useRef(selectedSiteId);
    placeIdRef.current = selectedSiteId;
    const inFlightRef = useRef(false);
    const [isStarting, setIsStarting] = useState(false);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const startDm = useCallback(
        async (peerId: string, options?: StartDmOptions): Promise<DomainChannel | null> => {
            if (!isAvailable || !peerId || inFlightRef.current) return null;
            const startedIn = cloudIdRef.current;
            const startedAt = placeIdRef.current;
            inFlightRef.current = true;
            setIsStarting(true);
            try {
                await switchesSettled(queryClient);
                const now = liveSelection();
                if (now.cloudId !== startedIn || now.placeId !== startedAt) return null;

                const room = await channelRepository.startDm({ peerId });
                if (!room?.id) throw new Error('[useStartDm] the room came back without an id');
                if (liveSelection().cloudId !== startedIn) return null;
                if (room.sid && startedAt && room.sid !== startedAt) {
                    logger.warn('CHANNEL', '[useStartDm] the room is in another place than it was asked from', {
                        startedAt,
                        roomPlaceId: room.sid,
                    });
                }
                if (!room.sid) void requestBackgroundRefresh();
                if (mountedRef.current) navigate(ROUTES.channels.room(room.id), { replace: !!options?.replace });
                return room;
            } catch (error) {
                logger.error('CHANNEL', '[useStartDm] start failed', { cloudId: startedIn, error });
                toast({ variant: 'destructive', title: t('cloudDm.picker.failed') });
                return null;
            } finally {
                inFlightRef.current = false;
                if (mountedRef.current) setIsStarting(false);
            }
        },
        [channelRepository, navigate, queryClient, isAvailable, t]
    );

    return { startDm, isStarting, isAvailable };
};
