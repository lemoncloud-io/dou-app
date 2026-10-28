import { useCallback } from 'react';

import { useChatInputLockExperiment } from '../../../hooks/useChatInputLockExperiment';
import { useInputLockStore } from '../stores/useInputLockStore';

export interface ChatInputLock {
    /** The Lab switch is on, so the lock can be offered at all. */
    isAvailable: boolean;
    /** The composer of this room — and of every thread in it — takes no input. */
    isLocked: boolean;
    setLocked: (isLocked: boolean) => void;
}

/**
 * The chat input lock for one room, read by the room, its threads and its settings screen alike, so
 * the three can never disagree. A thread is keyed by its room's channel id: locking a room locks the
 * replies under it too.
 *
 * The Lab switch is an input to the answer, not a check beside it: switched off, no room is locked and
 * nothing offers a lock, but the stored locks stay and come back when the switch does.
 */
export const useChatInputLock = (channelId: string | null | undefined): ChatInputLock => {
    const { isEnabled: isAvailable } = useChatInputLockExperiment();
    const isLockedHere = useInputLockStore(state => !!channelId && state.locked[channelId] === true);
    const setLocked = useCallback(
        (isLocked: boolean) => {
            if (channelId) useInputLockStore.getState().setLocked(channelId, isLocked);
        },
        [channelId]
    );
    return { isAvailable, isLocked: isAvailable && isLockedHere, setLocked };
};
