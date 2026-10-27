import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { safeLocalStorage } from '@chatic/shared';

export interface InputLockState {
    /** The rooms whose composer this device has locked, by channel id. A room's threads share its id. */
    locked: Record<string, true>;
    setLocked: (channelId: string, isLocked: boolean) => void;
    clearAll: () => void;
}

/**
 * Which rooms this person locked the composer of on this device (the Lab's chat input lock). Kept on
 * the device like a draft: the lock guards against an accidental send from this screen, it is not a
 * rule about the room, so no other member and no other device of mine sees it.
 *
 * Whether a lock is enforced is not this store's call — with the Lab switch off every lock here is
 * dormant (`useChatInputLock`), and turning it back on finds them where they were.
 */
export const useInputLockStore = create<InputLockState>()(
    persist(
        set => ({
            locked: {},
            setLocked: (channelId, isLocked) =>
                set(state => {
                    if (isLocked === (state.locked[channelId] === true)) return state;
                    if (isLocked) return { locked: { ...state.locked, [channelId]: true } };
                    const { [channelId]: _dropped, ...rest } = state.locked;
                    return { locked: rest };
                }),
            clearAll: () => set({ locked: {} }),
        }),
        {
            name: 'chatic.composer.inputLocks',
            storage: createJSONStorage(() => safeLocalStorage),
            partialize: state => ({ locked: state.locked }),
        }
    )
);

/** Lets every lock go. The next account on this device has its own rooms and must not inherit these. */
export const clearInputLocks = (): void => useInputLockStore.getState().clearAll();
