import { WebCoreFactory } from '@lemoncloud/lemon-web-core';

export * from './cloudCore';
export * from './coreStorage';

import { setStorageAdapter } from './coreStorage';

declare global {
    interface Window {
        ENV?: string;
        PROJECT?: string;
        REGION?: string;
        OAUTH_ENDPOINT?: string;
        HOST?: string;
        IMAGE_API_ENDPOINT?: string;
        SOCIAL_OAUTH_ENDPOINT?: string;
        DOU_ENDPOINT?: string;
        WS_ENDPOINT?: string;
    }
}

/**
 * Initialize environment from URL query parameters (web browser deeplink flow)
 *
 * When user clicks deeplink on landing page, envs are passed as query params:
 * - _backend → CHATIC_OAUTH_ENDPOINT, CHATIC_DOU_ENDPOINT
 * - _wss → CHATIC_WS_ENDPOINT
 *
 * Mobile WebView does NOT use query params (injects directly to sessionStorage),
 * so this only runs for web browser flow.
 */
const initEnvFromQueryParams = (): void => {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
        return;
    }

    try {
        const params = new URLSearchParams(window.location.search);
        const backend = params.get('_backend');
        const wss = params.get('_wss');

        // Only set if query params exist (web browser flow from landing page)
        // Mobile WebView doesn't have these params - it injects directly to sessionStorage
        if (backend) {
            sessionStorage.setItem('CHATIC_OAUTH_ENDPOINT', backend);
            sessionStorage.setItem('CHATIC_DOU_ENDPOINT', backend);
        }
        if (wss) {
            sessionStorage.setItem('CHATIC_WS_ENDPOINT', wss);
        }
    } catch {
        // Ignore errors (e.g., sessionStorage disabled)
    }
};

// Initialize from query params before reading localStorage
initEnvFromQueryParams();

// RN WebView 환경이면 네이티브 스토리지 어댑터로 교체
const isReactNativeWebView = (): boolean => !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;

if (isReactNativeWebView()) {
    setStorageAdapter(localStorage);
}

/**
 * Clear all auth tokens from storage when arriving from explicit logout.
 *
 * The LoginPage auto-registers a guest device on mount, which re-authenticates the user.
 * When logout redirects to /auth/login?logout=1, we must clear tokens BEFORE webCore.init()
 * runs, so isAuthenticated() returns false and the Router renders public routes.
 */
const clearTokensOnLogout = (): void => {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('logout') !== '1') return;

        const storage = isReactNativeWebView() ? localStorage : sessionStorage;
        const keysToRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key?.startsWith('@')) keysToRemove.push(key);
        }
        keysToRemove.forEach(key => storage.removeItem(key));
    } catch {
        // Ignore errors
    }
};
clearTokensOnLogout();

// Get endpoint from storage (mobile: localStorage, web: sessionStorage)
const getEndpointStorageItem = (key: string): string | null => {
    try {
        const storage = isReactNativeWebView() ? localStorage : sessionStorage;
        return storage.getItem(key);
    } catch {
        return null;
    }
};

/**
 * Environment configuration variables
 * - Loaded from Vite environment variables
 * - Normalized to lowercase for consistency
 * - Get ENV from index.html
 */
export const ENV = (window.ENV || import.meta.env.VITE_ENV || '').toLowerCase();
export const PROJECT = (window.PROJECT || import.meta.env.VITE_PROJECT || '').toLowerCase();
export const REGION = (window.REGION || import.meta.env.VITE_REGION || 'ap-northeast-2').toLowerCase();
export const OAUTH_ENDPOINT = (import.meta.env.VITE_OAUTH_ENDPOINT || '').toLowerCase();
export const HOST = (window.HOST || import.meta.env.VITE_HOST || '').toLowerCase();
export const SOCIAL_OAUTH_ENDPOINT = (
    window.SOCIAL_OAUTH_ENDPOINT ||
    import.meta.env.VITE_SOCIAL_OAUTH_ENDPOINT ||
    ''
).toLowerCase();
export const DOU_ENDPOINT = import.meta.env.VITE_DOU_ENDPOINT || '';
export const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

/**
 * Get DOU_ENDPOINT dynamically at call time
 *
 * Unlike the static DOU_ENDPOINT constant (resolved at module load),
 * this function resolves the endpoint each time it's called.
 *
 * Use this for deeplink flows where _backend param may be set after module initialization.
 *
 * Priority: sessionStorage/localStorage > window global > env variable
 */
export const getDynamicDOUEndpoint = (): string => {
    return (
        getEndpointStorageItem('CHATIC_DOU_ENDPOINT') || window.DOU_ENDPOINT || import.meta.env.VITE_DOU_ENDPOINT || ''
    );
};

/**
 * Key for storing language preference
 */
export const LANGUAGE_KEY = 'i18nextLng';

/**
 * WebCore instance configuration and initialization
 * - Sets up cloud provider and project details
 * - Configures OAuth endpoint and region
 */
export const webCore = WebCoreFactory.create({
    cloud: 'aws',
    project: ENV === 'local' ? `${PROJECT}_${ENV}` : PROJECT,
    oAuthEndpoint: OAUTH_ENDPOINT,
    region: REGION,
    storage: isReactNativeWebView() ? localStorage : sessionStorage,
});
