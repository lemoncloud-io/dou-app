import { create } from 'zustand';
import { coreStorage } from '../core/coreStorage';

const BLUR_LAST_MESSAGE_KEY = 'chatic-blur-last-message';

const getInitialBlurLastMessage = (): boolean => {
    return coreStorage.get(BLUR_LAST_MESSAGE_KEY) === 'true';
};

interface AppPreferenceStore {
    blurLastMessage: boolean;
    setBlurLastMessage: (value: boolean) => void;
}

export const useAppPreferenceStore = create<AppPreferenceStore>()(set => ({
    blurLastMessage: getInitialBlurLastMessage(),

    setBlurLastMessage: (value: boolean) => {
        coreStorage.set(BLUR_LAST_MESSAGE_KEY, value ? 'true' : 'false');
        set({ blurLastMessage: value });
    },
}));
