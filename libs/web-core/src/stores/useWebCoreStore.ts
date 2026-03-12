import { create } from 'zustand';

import { getMobileAppInfo, initializeMessageListener, useAppMessageStore } from '@chatic/app-messages';

import { updateProfile } from '../api';
import { LANGUAGE_KEY, cloudCore, webCore } from '../core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

export type UserView = Partial<UserProfile$>;

interface UserViewExtended {
    userRole?: string;
    userStatus?: string;
}

export interface WebCoreState {
    isInitialized: boolean;
    isAuthenticated: boolean;
    isOnMobileApp: boolean;
    isGuest: boolean;
    error: Error | null;
    profile: UserProfile$ | null;
    userName: string;
}

export interface WebCoreStore extends WebCoreState {
    initialize: () => void;
    logout: () => Promise<void>;
    setIsAuthenticated: (isAuth: boolean) => void;
    setProfile: (profile: UserProfile$) => void;
    updateProfile: (user: UserView) => Promise<void>;
    registerLogoutCallback: (callback: () => void) => () => void;
}

/**
 * Logout callback registry
 * Stores callbacks to be executed before logout (e.g., WebSocket disconnect)
 */
const logoutCallbacks = new Set<() => void>();

/**
 * Initial state configuration for the web core store
 */
const initialState: Pick<WebCoreStore, keyof WebCoreState> = {
    isInitialized: false,
    isAuthenticated: false,
    isOnMobileApp: false,
    isGuest: false,
    error: null,
    profile: null,
    userName: '',
};

/**
 * Zustand store for managing web core state and actions
 */
export const useWebCoreStore = create<WebCoreStore>()(set => ({
    ...initialState,

    /**
     * Initializes the web core application
     * - Sets up authentication state
     * - Configures language preferences
     * - Handles initialization errors
     */
    initialize: async () => {
        set({ isInitialized: false, error: null });
        await webCore.init();
        await webCore.setUseXLemonLanguage(true, LANGUAGE_KEY);
        const isAuthenticated = await webCore.isAuthenticated();

        const { isOnMobileApp } = getMobileAppInfo();
        if (isOnMobileApp) {
            initializeMessageListener();

            // Add handler for mobile app token sync response
            const appMessageStore = useAppMessageStore.getState();
            appMessageStore.addHandler('OnSuccessSyncCredential', message => {
                console.log('📱 Mobile token sync successful:', message);
                // TODO: Process token data from mobile app
            });
        }
        set({ isInitialized: true, isAuthenticated, isOnMobileApp });
    },

    /**
     * Handles user logout
     * - Executes registered logout callbacks
     * - Clears authentication state
     * - Removes user profile data
     * - Redirects to login page
     */
    logout: async () => {
        // Execute all registered callbacks before logout
        logoutCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('Logout callback error:', error);
            }
        });
        logoutCallbacks.clear();

        await webCore.logout();
        cloudCore.clearSession();
        set({ isAuthenticated: false, profile: null, userName: '', isGuest: false });
        window.location.href = '/';
    },

    /**
     * Updates authentication state
     * @param isAuthenticated - New authentication state
     */
    setIsAuthenticated: (isAuthenticated: boolean) => set({ isAuthenticated }),

    /**
     * Updates user profile information
     * @param profile - User profile data
     */
    setProfile: (profile: UserProfile$) =>
        set({
            profile,
            isGuest: (profile.$user as UserViewExtended)?.userRole === 'guest',
            userName: profile['$user']?.name || 'Unknown',
        }),

    /**
     * Updates username and related profile information
     * @param user - Updated user view data
     */
    updateProfile: async (user: Partial<UserProfile$>) => {
        await updateProfile(user);
        // TODO: set updated profile
        // set(state => {
        //     const profile = { ...state.profile, $user: user };
        //     const userName = user['name'];
        //     return { ...state, profile, userName };
        // });
    },

    /**
     * Registers a callback to be executed before logout
     * @param callback - Function to call before logout
     * @returns Unregister function to remove the callback
     */
    registerLogoutCallback: (callback: () => void) => {
        logoutCallbacks.add(callback);
        return () => {
            logoutCallbacks.delete(callback);
        };
    },
}));
