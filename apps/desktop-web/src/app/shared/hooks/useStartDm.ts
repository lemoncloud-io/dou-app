import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RELAY_CLOUD_ID, type DomainChannel } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { usePendingOpenStore } from '../stores';

/**
 * Open (or return to) the 1:1 with another member of the active cloud — the one call both entry
 * points share: the sidebar's "New message" picker and another person's profile card.
 *
 * The server resolves the pair to a single room, so there is no "already have one?" branch here:
 * asking again returns the room that exists. The room is opened through the pending-open target,
 * not selected directly: that path waits until the sidebar lists the new room (see
 * pendingOpenRoute) and works from surfaces outside the home screen. Its empty place means "stay in
 * this place", since a cloud 1:1 is listed in every place of its cloud.
 *
 * Only a subscription cloud offers it. On the default (relay) cloud a 1:1 is reached by inviting a
 * phone number, which is a mobile flow, so `isAvailable` is false there and each entry point hides.
 *
 * A second call while one is in flight returns null without reaching the server (a double click),
 * and a call whose cloud was switched away from before it answered opens nothing and returns null.
 * A failure is logged, shown as a toast, and returns null.
 */
type Repositories = ReturnType<typeof runtime.data.useRuntimeRepositories>;

/** One channel delta sync on the cloud's cursor — the key `useBackgroundSync` advances. */
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
        // The background poll still lists the room; only the immediate landing is lost.
        logger.warn('CHANNEL', '[useStartDm] channel sync after start failed', { error });
    }
};

export const useStartDm = () => {
    const { t } = useTranslation();
    const { channel: channelRepository, syncMeta } = runtime.data.useRuntimeRepositories();
    const cloudId = runtime.session.useGlobalSession().cloud.cloudId;
    const isAvailable = !!cloudId && cloudId !== RELAY_CLOUD_ID;

    // The cloud as of the latest render, read after the await: a switch while the call is in
    // flight leaves the returned room in the cloud that was left.
    const cloudIdRef = useRef(cloudId);
    cloudIdRef.current = cloudId;
    const inFlightRef = useRef(false);
    const [isStarting, setIsStarting] = useState(false);

    const startDm = useCallback(
        async (peerId: string): Promise<DomainChannel | null> => {
            if (!isAvailable || !peerId || inFlightRef.current) return null;
            const startedIn = cloudIdRef.current;
            inFlightRef.current = true;
            setIsStarting(true);
            try {
                const room = await channelRepository.startDm({ peerId });
                if (!room?.id) throw new Error('[useStartDm] the room came back without an id');
                if (cloudIdRef.current !== startedIn) return null;
                usePendingOpenStore.getState().request({ placeId: '', channelId: room.id });
                // A room the call just created comes back without a place, so it is not cached and the
                // sidebar only lists it after the next channel sync. The background poll is a minute
                // away, past the pending open's expiry, so pull the delta now on the same cursor.
                if (!room.sid && startedIn) void syncCloudChannels(channelRepository, syncMeta, startedIn);
                return room;
            } catch (error) {
                logger.error('CHANNEL', '[useStartDm] start failed', { error });
                toast({ variant: 'destructive', description: t('dm.start.failed') });
                return null;
            } finally {
                inFlightRef.current = false;
                setIsStarting(false);
            }
        },
        [channelRepository, syncMeta, isAvailable, t]
    );

    return { startDm, isStarting, isAvailable };
};
