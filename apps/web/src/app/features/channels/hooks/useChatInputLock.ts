import { useCallback } from 'react';

import { useChatInputLockExperiment } from '../../../hooks/useChatInputLockExperiment';
import { useInputLockStore } from '../stores/useInputLockStore';

export interface ChatInputLock {
    isAvailable: boolean;
    isLocked: boolean;
    setLocked: (isLocked: boolean) => void;
}

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
