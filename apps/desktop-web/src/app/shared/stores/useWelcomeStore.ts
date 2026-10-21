import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** The welcome page's state is one person's in one place: Later in a place says nothing about the next. */
export const welcomeKey = (userId: string, placeId: string): string => `${userId}:${placeId}`;

interface WelcomeState {
    /** Places (per person) where the welcome page was put away with Later. */
    dismissed: Record<string, true>;
    /** Places (per person) where an invite went out from this device — the server lists none back. */
    invited: Record<string, true>;
    dismiss: (key: string) => void;
    markInvited: (key: string) => void;
}

/** Device-local, persisted: Later holds across restarts, and a sent invite stays counted. */
export const useWelcomeStore = create<WelcomeState>()(
    persist(
        set => ({
            dismissed: {},
            invited: {},
            dismiss: key => set(state => (state.dismissed[key] ? state : { dismissed: { ...state.dismissed, [key]: true } })),
            markInvited: key => set(state => (state.invited[key] ? state : { invited: { ...state.invited, [key]: true } })),
        }),
        { name: 'chatic-welcome' }
    )
);
