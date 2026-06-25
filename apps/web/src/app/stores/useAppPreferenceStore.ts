import { create } from 'zustand';

// App-local user preferences. Previously in `@chatic/web-core` (backed by its
// internal coreStorage); reimplemented here against localStorage with the same
// key so an existing user's preference value carries over after the migration.
const BLUR_LAST_MESSAGE_KEY = 'chatic-blur-last-message';

const getInitialBlurLastMessage = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(BLUR_LAST_MESSAGE_KEY) === 'true';
};

interface AppPreferenceStore {
    blurLastMessage: boolean;
    setBlurLastMessage: (value: boolean) => void;
}

export const useAppPreferenceStore = create<AppPreferenceStore>()(set => ({
    blurLastMessage: getInitialBlurLastMessage(),

    setBlurLastMessage: (value: boolean) => {
        localStorage.setItem(BLUR_LAST_MESSAGE_KEY, value ? 'true' : 'false');
        set({ blurLastMessage: value });
    },
}));
