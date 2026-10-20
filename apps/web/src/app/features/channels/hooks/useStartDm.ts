import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { RELAY_CLOUD_ID, type DomainChannel } from '@chatic/data';
import { useNavigateWithTransition } from '@chatic/shared';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { ROUTES } from '../../../routes/paths';
import { requestBackgroundRefresh } from '../../../runtime/backgroundRefresh';

export interface StartDmOptions {
    /**
     * Replace the current history entry with the room instead of pushing it. The picker passes it, so
     * back from the new room returns to where the picker was opened rather than to the picker.
     */
    replace?: boolean;
}

export interface UseStartDmResult {
    /** Opens the 1:1 with this peer and moves into it. Resolves to the room, or `null` if nothing opened. */
    startDm: (peerId: string, options?: StartDmOptions) => Promise<DomainChannel | null>;
    isStarting: boolean;
    /** A cloud 1:1 can be opened here at all: a subscription cloud with a place to file it under. */
    isAvailable: boolean;
}

/**
 * Resolves once no place or cloud switch is running. Read from the mutation cache rather than a
 * render, so the wait does not depend on the calling screen re-rendering.
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

/**
 * Opens the 1:1 with one member of the active place and goes there — the one hook both entry points
 * share: home's 1:1 picker and a member's profile.
 *
 * **There is no "already have a room with them" branch.** The server resolves a pair to a single room
 * per place, creating it or handing back the one that exists, so both arrive as the same answer.
 *
 * **A 1:1 is filed under the place the session is on when the server answers, for good.** So a call
 * made while a place (or cloud) switch is running waits for it to settle before it goes out: sent
 * earlier it would reach a session still on the place being left, and the room would belong there. If
 * the cloud or the place has moved by the time the switch settles — a failed switch rolls back, a
 * second one may follow — nothing is sent, because the place the person asked from is gone. Desktop's
 * hook holds the same wait; it lives here, in the one hook, so no entry point has to lock its button
 * during a switch.
 *
 * Only a subscription cloud offers it. On the relay a 1:1 is reached by inviting a phone number, so
 * `isAvailable` is false there and each entry point hides.
 *
 * A second call while one is in flight — waiting included — returns null without reaching the server
 * (a double tap), and so does a call whose cloud or place moved away under it: neither is a failure
 * worth a sentence. A call whose screen was left before the room came back still makes the room —
 * the request is already out, and home lists it — but does not pull the person into it from wherever
 * they went. A real failure is logged, said once here as a toast, and returns null — so no
 * entry point writes its own catch.
 */
export const useStartDm = (): UseStartDmResult => {
    const { t } = useTranslation();
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const navigate = useNavigateWithTransition();
    const queryClient = useQueryClient();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const isAvailable = !!selectedCloudId && selectedCloudId !== RELAY_CLOUD_ID && !!selectedSiteId;

    // The selection as of the latest render. During a switch it already names the place being
    // switched to — the one the person is asking from.
    const cloudIdRef = useRef(selectedCloudId);
    cloudIdRef.current = selectedCloudId;
    const placeIdRef = useRef(selectedSiteId);
    placeIdRef.current = selectedSiteId;
    /**
     * A ref, not `isStarting`, because the guard has to hold WITHIN a tick: two taps dispatched before
     * React re-renders both read the old state, and the second navigation would land on top of the
     * first.
     */
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
                // A room with no id cannot be addressed; treat it as a failure rather than navigating
                // to `/channels/undefined/room`.
                if (!room?.id) throw new Error('[useStartDm] the room came back without an id');
                // A cloud switch while the call was in flight leaves the room in the cloud that was left.
                if (liveSelection().cloudId !== startedIn) return null;
                if (room.sid && startedAt && room.sid !== startedAt) {
                    logger.warn('CHANNEL', '[useStartDm] the room is in another place than it was asked from', {
                        startedAt,
                        roomPlaceId: room.sid,
                    });
                }
                // A room that names no place (an older pair-keyed 1:1) is not written to the cache, so
                // home lists it only after the next channel sync. Ask for that sync now instead of
                // waiting for the poll; the room screen itself does not need it.
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
