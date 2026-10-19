import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

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
 * The server resolves the pair to a single room per place, so there is no "already have one?" branch
 * here: asking again in the same place returns the room that exists. The room is opened through the
 * pending-open target, not selected directly: that path waits until the sidebar lists the new room
 * (see pendingOpenRoute) and works from surfaces outside the home screen.
 *
 * **A 1:1 is filed under the place the session is in when the server answers, for good.** So a call
 * made while a place (or cloud) switch is running waits for the switch to settle before it goes out: sent
 * earlier it reaches a session still on the place being left, and the room is opened there. If the
 * cloud or the place has moved by the time the switch settles — a failed switch rolls back, a second
 * one may follow — nothing is sent, because the place the person asked from is gone. The wait is held
 * here, in the one hook, so no entry point has to lock its button during a switch. The room's own
 * place (`room.sid`) is what the pending open lands on. When it is not the place the call started
 * from, that is logged and the open still goes to the room's place rather than leaving it unlisted
 * in this one.
 *
 * Only a subscription cloud offers it. On the default (relay) cloud a 1:1 is reached by inviting a
 * phone number, which is a mobile flow, so `isAvailable` is false there and each entry point hides;
 * the sidebar's empty 1:1 section on Home points at the mobile app instead.
 *
 * A second call while one is in flight — waiting included — returns null without reaching the server
 * (a double click), and a call whose cloud was switched away from before it answered opens nothing
 * and returns null. A failure is logged, shown as a toast, and returns null.
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

/**
 * Resolves once no place or cloud switch is running. Read from the mutation cache rather than a
 * render, so a caller that unmounts mid-wait (a dialog closing on its own click) still sends once it
 * settles.
 */
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

/**
 * The selected cloud and place as the session holds them right now. Read live, not from a render: a
 * failed switch rolls the place back inside its own mutation, and the wait above can resolve before
 * React has rendered the rollback.
 */
const liveSelection = (): { cloudId: string | null; placeId: string | null } => {
    const { cloud } = runtime.session.getGlobalSessionContext();
    return { cloudId: cloud.cloudId, placeId: cloud.siteId };
};

export const useStartDm = () => {
    const { t } = useTranslation();
    const { channel: channelRepository, syncMeta } = runtime.data.useRuntimeRepositories();
    const cloudId = runtime.session.useGlobalSession().cloud.cloudId;
    const isAvailable = !!cloudId && cloudId !== RELAY_CLOUD_ID;
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const queryClient = useQueryClient();

    // The cloud and place as of the latest render. The cloud is read again after the answer: a cloud
    // switch while the call is in flight leaves the returned room in the cloud that was left. The
    // place a call starts from is the selection when it was made (during a switch, the place being
    // switched to); after the wait the live selection is compared with it (`liveSelection`).
    const cloudIdRef = useRef(cloudId);
    cloudIdRef.current = cloudId;
    const placeIdRef = useRef(selectedSiteId);
    placeIdRef.current = selectedSiteId;
    const inFlightRef = useRef(false);
    const [isStarting, setIsStarting] = useState(false);

    // Both opens share one flight, one cloud guard and one failure path; they differ only in the
    // call that yields the room.
    const open = useCallback(
        async (kind: 'dm' | 'self', request: () => Promise<DomainChannel>): Promise<DomainChannel | null> => {
            if (inFlightRef.current) return null;
            const startedIn = cloudIdRef.current;
            // During a switch the selection already names the place being switched to — the one the
            // person is asking from.
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
                // My notes-to-self room keeps "stay where you are": it is listed in every place.
                usePendingOpenStore
                    .getState()
                    .request({ placeId: kind === 'dm' ? room.sid || '' : '', channelId: room.id });
                // A room that names no place (an older pair-keyed 1:1 whose answer carries no place
                // field) is not cached, so the sidebar only lists it after the next channel sync. The
                // background poll is a minute away, past the pending open's expiry, so pull the delta
                // now on the same cursor.
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
        [channelRepository, syncMeta, queryClient, t]
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
