import { useCallback, useRef, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import type { DomainChannel } from '@chatic/data';
import { useNavigateWithTransition } from '@chatic/shared';

import { ROUTES } from '../../../routes/paths';

export interface UseStartDmResult {
    /** Opens the 1:1 with this peer and moves into it. Resolves to the room, or `null` if it failed. */
    startDm: (peerId: string) => Promise<DomainChannel | null>;
    isStarting: boolean;
    /** The last attempt failed. Cleared when the next one begins. */
    isError: boolean;
}

/**
 * Opens the 1:1 with one peer and goes there.
 *
 * Two entry points need this — the peer's profile inside a room, and the picker — and they must not
 * grow two versions of it. What differs between them is which id they hand over; everything after
 * that (one call in flight, where a failure is recorded, which route the room is at) is the same
 * question and is answered once, here.
 *
 * **There is no "already have a room with them" branch.** The server resolves a pair to a single
 * room, creating it or handing back the one that exists, so both cases arrive as the same response
 * and neither caller has to know which it got.
 *
 * **Failure returns `null` rather than throwing**, which is the opposite of the write hooks around
 * it. Those are called from one screen that owns the recovery; this one is called from two whose
 * only response is to say so and stay put, and a rejected promise would have each of them write
 * that catch. The error still reaches the log.
 */
export const useStartDm = (): UseStartDmResult => {
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const navigate = useNavigateWithTransition();
    const [isStarting, setIsStarting] = useState(false);
    const [isError, setIsError] = useState(false);
    /**
     * A ref, not `isStarting`, because this guard has to hold WITHIN a tick. Two taps dispatched
     * before React re-renders both read the old state, so a state flag lets the second call through
     * — and a second call is not harmless: the room opens, the first navigation lands, and the
     * second one lands on top of it.
     */
    const inFlight = useRef(false);

    const startDm = useCallback(
        async (peerId: string): Promise<DomainChannel | null> => {
            if (!peerId || inFlight.current) return null;
            inFlight.current = true;
            setIsStarting(true);
            setIsError(false);

            try {
                const channel = await channelRepository.startDm({ peerId });
                // The repository stores the row before this resolves, so a room with no id would mean
                // the cache holds something the list cannot key. Treat it as a failure rather than
                // navigating to `/channels/undefined/room`.
                if (!channel?.id) throw new Error('[useStartDm] the room came back without an id');
                navigate(ROUTES.channels.room(channel.id));
                return channel;
            } catch (error) {
                setIsError(true);
                logger.error('CHANNEL', '[useStartDm] start failed', { error });
                return null;
            } finally {
                inFlight.current = false;
                setIsStarting(false);
            }
        },
        [channelRepository, navigate]
    );

    return { startDm, isStarting, isError };
};
