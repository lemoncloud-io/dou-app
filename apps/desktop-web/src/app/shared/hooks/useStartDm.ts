import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RELAY_CLOUD_ID, type DomainChannel } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { usePendingOpenStore } from '../stores';

/**
 * Open (or return to) the 1:1 with another member of the active cloud, or my own notes-to-self room
 * (`openSelf`) — the one hook every entry point shares: the sidebar's "New message" picker and a
 * profile card.
 *
 * The server resolves the pair to a single room, so there is no "already have one?" branch here:
 * asking again returns the room that exists. The room is opened through the pending-open target,
 * not selected directly: that path waits until the sidebar lists the new room (see
 * pendingOpenRoute) and works from surfaces outside the home screen. Its empty place means "stay in
 * this place": the picker's pool is read from this place's list (group members, plus the peers of the
 * 1:1s it lists), so the room it opens is one this place lists.
 *
 * Only a subscription cloud offers it. On the default (relay) cloud a 1:1 is reached by inviting a
 * phone number, which is a mobile flow, so `isAvailable` is false there and each entry point hides;
 * the sidebar's empty 1:1 section on Home points at the mobile app instead.
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
    const { selectedSiteId } = runtime.session.useSessionSelection();

    // The cloud as of the latest render, read after the await: a switch while the call is in
    // flight leaves the returned room in the cloud that was left.
    const cloudIdRef = useRef(cloudId);
    cloudIdRef.current = cloudId;
    const inFlightRef = useRef(false);
    const [isStarting, setIsStarting] = useState(false);

    // Both opens share one flight, one cloud guard and one failure path; they differ only in the
    // call that yields the room.
    const open = useCallback(
        async (kind: 'dm' | 'self', request: () => Promise<DomainChannel>): Promise<DomainChannel | null> => {
            if (inFlightRef.current) return null;
            const startedIn = cloudIdRef.current;
            inFlightRef.current = true;
            setIsStarting(true);
            try {
                const room = await request();
                if (!room?.id) throw new Error('[useStartDm] the room came back without an id');
                if (cloudIdRef.current !== startedIn) return null;
                usePendingOpenStore.getState().request({ placeId: '', channelId: room.id });
                // A room the call just created comes back without a place, so it is not cached and the
                // sidebar only lists it after the next channel sync. The background poll is a minute
                // away, past the pending open's expiry, so pull the delta now on the same cursor.
                if (!room.sid && startedIn) void syncCloudChannels(channelRepository, syncMeta, startedIn);
                return room;
            } catch (error) {
                logger.error('CHANNEL', '[useStartDm] start failed', { kind, cloudId: startedIn, error });
                toast({ variant: 'destructive', description: t('dm.start.failed') });
                return null;
            } finally {
                inFlightRef.current = false;
                setIsStarting(false);
            }
        },
        [channelRepository, syncMeta, t]
    );

    const startDm = useCallback(
        (peerId: string): Promise<DomainChannel | null> =>
            isAvailable && peerId ? open('dm', () => channelRepository.startDm({ peerId })) : Promise.resolve(null),
        [open, channelRepository, isAvailable]
    );

    // `channel.start-dm` refuses my own id (400); my notes-to-self room has its own get-or-create
    // call. Its answer carries no place, so the repository tags the row with the one it is given,
    // and without an open place there is nothing to tag it with.
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
