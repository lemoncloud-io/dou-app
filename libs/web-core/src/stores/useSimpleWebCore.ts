import { create } from 'zustand';

import { simpleWebCore } from '../core/simpleWebCore';

import type { UserView } from '@lemoncloud/chatic-backend-api';

const PROFILE_KEY = 'chatic-profile';

export interface SimpleWebCoreState {
    isAuthenticated: boolean;
    isInitialized: boolean;
    profile: UserView | null;
    isGuest: boolean;
}

export interface SimpleWebCoreStore extends SimpleWebCoreState {
    setIsAuthenticated: (isAuth: boolean) => void;
    setProfile: (profile: UserView | null) => void;
    login: (profile?: UserView) => void;
    logout: () => void;
    checkAuth: () => void;
    initialize: () => void;
}

const saveProfile = (profile: UserView | null): void => {
    if (profile) {
        sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } else {
        sessionStorage.removeItem(PROFILE_KEY);
    }
};

const getProfile = (): UserView | null => {
    const stored = sessionStorage.getItem(PROFILE_KEY);
    return stored ? JSON.parse(stored) : null;
};

const getIsGuest = (profile: UserView | null): boolean =>
    (profile as unknown as Record<string, unknown>)?.['userRole'] === 'guest';

export const useSimpleWebCore = create<SimpleWebCoreStore>(set => ({
    isAuthenticated: false,
    isInitialized: false,
    profile: null,
    isGuest: false,

    setIsAuthenticated: (isAuthenticated: boolean) => set({ isAuthenticated }),

    setProfile: (profile: UserView | null) => {
        saveProfile(profile);
        set({ profile, isGuest: getIsGuest(profile) });
    },

    login: (profile?: UserView) => {
        if (profile) saveProfile(profile);
        set({ isAuthenticated: true, profile: profile || null, isGuest: getIsGuest(profile ?? null) });
    },

    logout: () => {
        simpleWebCore.clearToken();
        saveProfile(null);
        set({ isAuthenticated: false, profile: null, isGuest: false });
    },

    checkAuth: () => {
        const token = simpleWebCore.getToken();
        const profile = getProfile();
        set({ isAuthenticated: !!token, profile, isGuest: getIsGuest(profile) });
    },

    initialize: () => {
        const token = simpleWebCore.getToken();
        const profile = getProfile();
        set({ isAuthenticated: !!token, profile, isInitialized: true, isGuest: getIsGuest(profile) });
    },
}));
