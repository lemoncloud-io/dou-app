import type { AxiosRequestConfig } from 'axios';
import { WebCoreFactory } from '@lemoncloud/lemon-web-core';
import { setStorageAdapter } from '@chatic/shared';

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

const initEnvFromQueryParams = (): void => {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
        return;
    }

    try {
        const params = new URLSearchParams(window.location.search);
        const backend = params.get('_backend');
        const wss = params.get('_wss');

        if (backend) {
            sessionStorage.setItem('CHATIC_OAUTH_ENDPOINT', backend);
            sessionStorage.setItem('CHATIC_DOU_ENDPOINT', backend);
        }
        if (wss) {
            sessionStorage.setItem('CHATIC_WS_ENDPOINT', wss);
        }
    } catch {
        // ignore
    }
};

initEnvFromQueryParams();

const isReactNativeWebView = (): boolean => !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;
const isDesktopShell = (): boolean => !!(window as Window & { ChaticMessageHandler?: unknown }).ChaticMessageHandler;
const WEB_LANGUAGE_KEY = 'i18nextLng';

export const usePersistentWebStorage = isReactNativeWebView() || isDesktopShell();

if (usePersistentWebStorage) {
    setStorageAdapter(localStorage);
}

const clearTokensOnLogout = (): void => {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('logout') !== '1') return;

        const storage = usePersistentWebStorage ? localStorage : sessionStorage;
        const languageKeySuffix = `.${WEB_LANGUAGE_KEY}`;
        const keysToRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key?.startsWith('@') && !key.endsWith(languageKeySuffix)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => storage.removeItem(key));
        sessionStorage.removeItem('chatic-oauth-provider');
        localStorage.removeItem('chatic-oauth-provider');
    } catch {
        // ignore
    }
};

clearTokensOnLogout();

const getEndpointStorageItem = (key: string): string | null => {
    try {
        const storage = usePersistentWebStorage ? localStorage : sessionStorage;
        return storage.getItem(key);
    } catch {
        return null;
    }
};

export const clearRelayTransportOverrides = (): void => {
    sessionStorage.removeItem('CHATIC_OAUTH_ENDPOINT');
    sessionStorage.removeItem('CHATIC_DOU_ENDPOINT');
    sessionStorage.removeItem('CHATIC_WS_ENDPOINT');
    localStorage.removeItem('CHATIC_OAUTH_ENDPOINT');
    localStorage.removeItem('CHATIC_DOU_ENDPOINT');
    localStorage.removeItem('CHATIC_WS_ENDPOINT');
};

export const WEB_ENV = (window.ENV || import.meta.env.VITE_ENV || '').toLowerCase();
export const WEB_PROJECT = (window.PROJECT || import.meta.env.VITE_PROJECT || '').toLowerCase();
export const WEB_REGION = (window.REGION || import.meta.env.VITE_REGION || 'ap-northeast-2').toLowerCase();
export const WEB_OAUTH_ENDPOINT = (import.meta.env.VITE_OAUTH_ENDPOINT || '').toLowerCase();
export const WEB_HOST = (window.HOST || import.meta.env.VITE_HOST || '').toLowerCase();
export const WEB_SOCIAL_OAUTH_ENDPOINT = (
    window.SOCIAL_OAUTH_ENDPOINT ||
    import.meta.env.VITE_SOCIAL_OAUTH_ENDPOINT ||
    ''
).toLowerCase();
export const WEB_DOU_ENDPOINT = import.meta.env.VITE_DOU_ENDPOINT || '';
export const WEB_WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

export const getDynamicRelayBackend = (): string => {
    return (
        getEndpointStorageItem('CHATIC_DOU_ENDPOINT') || window.DOU_ENDPOINT || import.meta.env.VITE_DOU_ENDPOINT || ''
    );
};

export const getDynamicRelayWss = (): string => {
    return getEndpointStorageItem('CHATIC_WS_ENDPOINT') || window.WS_ENDPOINT || import.meta.env.VITE_WS_ENDPOINT || '';
};

export interface TransportRequestBuilder {
    setBody: (body: unknown) => TransportRequestBuilder;
    setParams: (params: Record<string, unknown>) => TransportRequestBuilder;
    execute: <T>() => Promise<{ data: T }>;
}

export interface WebTransport {
    init(): Promise<void>;
    logout(): Promise<void>;
    isAuthenticated(): Promise<boolean>;
    setUseXLemonLanguage(enabled: boolean, key: string): Promise<void>;
    buildRequest(config: AxiosRequestConfig): TransportRequestBuilder;
    buildSignedRequest(config: AxiosRequestConfig): TransportRequestBuilder;
    buildCredentialsByToken(token: unknown): Promise<unknown>;
    getTokenSignature(): Promise<any>;
    getTokenStorage(): {
        getCachedOAuthToken(): Promise<{ identityToken?: string } | null>;
        saveOAuthToken(token: unknown): Promise<void> | void;
    };
}

export const webTransport = WebCoreFactory.create({
    cloud: 'aws',
    project: WEB_ENV === 'local' ? `${WEB_PROJECT}_${WEB_ENV}` : WEB_PROJECT,
    oAuthEndpoint: WEB_OAUTH_ENDPOINT,
    region: WEB_REGION,
    storage: usePersistentWebStorage ? localStorage : sessionStorage,
}) as unknown as WebTransport;

let pendingInit: Promise<void> | null = null;
let initDone = false;

export const startWebTransportInit = (): Promise<void> => {
    if (initDone) return Promise.resolve();
    if (pendingInit) return pendingInit;
    pendingInit = webTransport
        .init()
        .then(() => {
            initDone = true;
        })
        .finally(() => {
            pendingInit = null;
        });
    return pendingInit;
};

export const resetWebTransportInit = (): void => {
    initDone = false;
    pendingInit = null;
};

startWebTransportInit().catch(() => {
    // intentionally empty
});
