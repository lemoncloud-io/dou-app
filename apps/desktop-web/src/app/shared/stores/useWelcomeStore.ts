import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deviceStore, persistStorageOver } from '../../storage';

export const welcomeKey = (userId: string, placeId: string): string => `${userId}:${placeId}`;

interface WelcomeState {
    dismissed: Record<string, true>;
    invited: Record<string, true>;
    dismiss: (key: string) => void;
    markInvited: (key: string) => void;
}

export const useWelcomeStore = create<WelcomeState>()(
    persist(
        set => ({
            dismissed: {},
            invited: {},
            dismiss: key =>
                set(state => (state.dismissed[key] ? state : { dismissed: { ...state.dismissed, [key]: true } })),
            markInvited: key =>
                set(state => (state.invited[key] ? state : { invited: { ...state.invited, [key]: true } })),
        }),
        { name: 'chatic-welcome', storage: persistStorageOver(deviceStore) }
    )
);
