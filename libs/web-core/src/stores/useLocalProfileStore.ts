import { create } from 'zustand';

const LOCAL_PROFILE_KEY = 'chatic-local-profile';

interface LocalProfileState {
    name?: string;
    imageData?: string; // base64 data URI
    updatedAt?: number;
}

interface LocalProfileActions {
    setName: (name: string) => void;
    setImage: (imageData: string) => void;
    clearOverrides: () => void;
    loadFromStorage: () => void;
}

export type LocalProfileStore = LocalProfileState & LocalProfileActions;

const loadFromLocalStorage = (): LocalProfileState => {
    if (typeof window === 'undefined') return {};
    try {
        const item = window.localStorage.getItem(LOCAL_PROFILE_KEY);
        return item ? JSON.parse(item) : {};
    } catch (error) {
        console.log('Error reading local profile from localStorage:', error);
        return {};
    }
};

const saveToLocalStorage = (state: LocalProfileState) => {
    try {
        window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(state));
    } catch (error) {
        console.log('Error saving local profile to localStorage:', error);
    }
};

export const useLocalProfileStore = create<LocalProfileStore>((set, get) => ({
    ...loadFromLocalStorage(),

    setName: (name: string) => {
        const newState = {
            ...get(),
            name,
            updatedAt: Date.now(),
        };
        saveToLocalStorage(newState);
        set({ name, updatedAt: newState.updatedAt });
    },

    setImage: (imageData: string) => {
        const newState = {
            ...get(),
            imageData,
            updatedAt: Date.now(),
        };
        saveToLocalStorage(newState);
        set({ imageData, updatedAt: newState.updatedAt });
    },

    clearOverrides: () => {
        try {
            window.localStorage.removeItem(LOCAL_PROFILE_KEY);
        } catch (error) {
            console.log('Error clearing local profile:', error);
        }
        set({ name: undefined, imageData: undefined, updatedAt: undefined });
    },

    loadFromStorage: () => {
        const stored = loadFromLocalStorage();
        set(stored);
    },
}));
