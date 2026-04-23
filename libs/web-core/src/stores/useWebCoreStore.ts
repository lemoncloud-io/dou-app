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
const PROFILE_CACHE_KEY = 'chatic-profile-cache';

/**
 * Read invited flag.
 *
 * Stored in both coreStorage (sessionStorage on web, localStorage on RN
 * WebView) AND localStorage directly, so the flag survives tab close/reopen
 * on web and matches the profile cache lifetime (localStorage). Reads either
 * side and treats a 'true' on either as invited.
 */
export const getIsInvited = (): boolean => {
    try {
        if (localStorage.getItem(INVITED_SESSION_KEY) === 'true') return true;
    } catch {
        // ignore
    }
    return coreStorage.get(INVITED_SESSION_KEY) === 'true';
};

/**
 * Write invited flag to both coreStorage (web: sessionStorage, RN WebView:
 * localStorage) and localStorage directly. Matches `clearTokensOnLogout`
 * which already clears both sides.
 */
export const setIsInvitedSession = (value: boolean): void => {
    if (value) {
        coreStorage.set(INVITED_SESSION_KEY, 'true');
        try {
            localStorage.setItem(INVITED_SESSION_KEY, 'true');
        } catch {
            // ignore
        }
    } else {
        coreStorage.remove(INVITED_SESSION_KEY);
        try {
            localStorage.removeItem(INVITED_SESSION_KEY);
        } catch {
            // ignore
        }
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
    updateProfile: (uid: string, user: Record<string, unknown>) => Promise<void>;
    registerLogoutCallback: (callback: () => void) => () => void;
}

/**
 * Logout callback registry
 * Stores callbacks to be executed before logout (e.g., WebSocket disconnect)
 */
const logoutCallbacks = new Set<() => void>();

/**
 * Initial state configuration for the web core store
 *
 * Hydrates profile/isInvited and their derived flags from persisted storage
 * so the first render matches the post-`setProfile` state. Without this,
 * `useUserContext` briefly computes the wrong userType on app boot.
 */
const initialState: Pick<WebCoreStore, keyof WebCoreState> = (() => {
    let profile: UserProfile$ | null = null;
    try {
        const cached = localStorage.getItem(PROFILE_CACHE_KEY);
        profile = cached ? (JSON.parse(cached) as UserProfile$) : null;
    } catch {
        profile = null;
    }

    const isInvited = getIsInvited();
    const userRole = (profile?.$user as UserViewExtended | undefined)?.userRole;
    const isGuest = userRole === 'guest' && !isInvited;
    const isCloudUser = isInvited || userRole === 'user';

    return {
        isInitialized: false,
        isAuthenticated: false,
        isOnMobileApp: false,
        isGuest,
        isInvited,
        isCloudUser,
        error: null,
        profile,
        userName: profile ? profile['$user']?.name || 'Unknown' : '',
    };
})();

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
        try {
            localStorage.removeItem(PROFILE_CACHE_KEY);
        } catch {
            /* ignore */
        }

        // history 전체 정리 후 login 페이지로 이동
        // window.location.href는 history에 엔트리를 추가하므로, 로그아웃 후 스와이프 백으로
        // 이전 페이지에 접근하는 것을 방지하기 위해 history를 전부 비운 뒤 replace 사용
        let targetUrl = '/auth/login?logout=1';
        if (options?.preserveUrl) {
            const params = new URLSearchParams(searchBeforeCleanup);
            const loginUrl = new URL('/auth/login', window.location.origin);
            for (const key of ['code', 'provider', '_backend', '_wss']) {
                const value = params.get(key);
                if (value) loginUrl.searchParams.set(key, value);
            }
            loginUrl.searchParams.set('logout', '1');
            targetUrl = loginUrl.toString();
        }

        const stepsBack = window.history.length - 1;
        if (stepsBack > 0) {
            window.addEventListener(
                'popstate',
                () => {
                    window.location.replace(targetUrl);
                },
                { once: true }
            );
            window.history.go(-stepsBack);
        } else {
            window.location.replace(targetUrl);
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
        try {
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
        } catch {
            // ignore
        }
        const userRoleGuest = (profile.$user as UserViewExtended)?.userRole === 'guest';
        const isInvited = getIsInvited();

        // Treat as guest if: role is guest, OR (not invited, no cloud, no active social login)
        const isGuest = userRoleGuest && !isInvited;
        const isCloudUser = isInvited || (profile.$user as UserViewExtended)?.userRole === 'user';
        return set({
            profile,
            isGuest,
            isInvited,
            isCloudUser,
            userName: profile['$user']?.name || 'Unknown',
        });
    },

    /**
     * Updates username and related profile information
     * @param user - Updated user view data
     */
    updateProfile: async (uid: string, user: Record<string, unknown>) => {
        await updateProfile(uid, user);
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
