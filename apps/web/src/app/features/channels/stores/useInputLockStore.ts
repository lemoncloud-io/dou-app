import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { deviceStore, persistStorageOver } from '../../../storage';

export interface InputLockState {
    locked: Record<string, true>;
    setLocked: (channelId: string, isLocked: boolean) => void;
    clearAll: () => void;
}

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
            storage: persistStorageOver(deviceStore),
            partialize: state => ({ locked: state.locked }),
        }
    )
);

export const clearInputLocks = (): void => useInputLockStore.getState().clearAll();
