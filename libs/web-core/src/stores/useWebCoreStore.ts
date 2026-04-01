import { create } from 'zustand';

import { getMobileAppInfo, initializeMessageListener, postMessage, useAppMessageStore } from '@chatic/app-messages';
import type { OAuthLoginProvider } from '@chatic/app-messages';

import { updateProfile } from '../api';
import { LANGUAGE_KEY, cloudCore, webCore, coreStorage } from '../core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

export type UserView = Partial<UserProfile$>;

interface UserViewExtended {
    userRole?: string;
    userStatus?: string;
}

const INVITED_SESSION_KEY = 'chatic-is-invited';
const OAUTH_PROVIDER_KEY = 'chatic-oauth-provider';

export const getIsInvited = (): boolean => coreStorage.get(INVITED_SESSION_KEY) === 'true';
export const setIsInvitedSession = (value: boolean): void => {
    if (value) {
        coreStorage.set(INVITED_SESSION_KEY, 'true');
    } else {
        coreStorage.remove(INVITED_SESSION_KEY);
    }
};

export const getOAuthProvider = (): OAuthLoginProvider | null =>
    coreStorage.get(OAUTH_PROVIDER_KEY) as OAuthLoginProvider | null;

export const setOAuthProvider = (provider: OAuthLoginProvider | null): void => {
    if (provider) {
        coreStorage.set(OAUTH_PROVIDER_KEY, provider);
    } else {
        coreStorage.remove(OAUTH_PROVIDER_KEY);
    }
};

export interface WebCoreState {
    isInitialized: boolean;
    isAuthenticated: boolean;
    isOnMobileApp: boolean;
    isGuest: boolean;
    isInvited: boolean;
    isCloudUser: boolean;
    error: Error | null;
    profile: UserProfile$ | null;
    userName: string;
}

export interface LogoutOptions {
    /** Preserve current URL (pathname + search) instead of redirecting to /auth/login */
    preserveUrl?: boolean;
}

export interface WebCoreStore extends WebCoreState {
    initialize: () => void;
    logout: (options?: LogoutOptions) => Promise<void>;
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
    isInvited: false,
    isCloudUser: false,
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
    logout: async (options?: LogoutOptions) => {
        // Capture URL params before cleanup (cleanup may affect the URL)
        const searchBeforeCleanup = window.location.search;

        // Execute all registered callbacks before logout
        logoutCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('Logout callback error:', error);
            }
        });
        logoutCallbacks.clear();

        // Revoke OAuth session on native side if applicable
        const oauthProvider = getOAuthProvider();
        const { isOnMobileApp } = getMobileAppInfo();
        if (oauthProvider && isOnMobileApp) {
            postMessage({ type: 'OAuthLogout', data: { provider: oauthProvider } });
        }
        setOAuthProvider(null);

        await webCore.logout();
        cloudCore.clearSession();
        setIsInvitedSession(false);
        localStorage.removeItem('chatic-device-token');

        set({ isAuthenticated: false, profile: null, userName: '', isGuest: false, isInvited: false });

        if (options?.preserveUrl) {
            const params = new URLSearchParams(searchBeforeCleanup);
            const loginUrl = new URL('/auth/login', window.location.origin);
            for (const key of ['code', 'provider', '_backend', '_wss']) {
                const value = params.get(key);
                if (value) loginUrl.searchParams.set(key, value);
            }
            loginUrl.searchParams.set('logout', '1');
            window.location.href = loginUrl.toString();
        } else {
            window.location.href = '/auth/login?logout=1';
        }
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
    setProfile: (profile: UserProfile$) => {
        const userRoleGuest = (profile.$user as UserViewExtended)?.userRole === 'guest';
        const isInvited = getIsInvited();
        const hasCloudSession = !!cloudCore.getSelectedCloudId();
        const hasSocialLogin = !!getOAuthProvider();
        // Treat as guest if: role is guest, OR (not invited, no cloud, no active social login)
        const isGuest = userRoleGuest || (!isInvited && !hasCloudSession && !hasSocialLogin);
        return set({
            profile,
            isGuest,
            isInvited,
            isCloudUser: isInvited || hasCloudSession,
            userName: profile['$user']?.name || 'Unknown',
        });
    },

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
