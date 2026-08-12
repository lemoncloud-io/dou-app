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
    /** Rebuilds the in-memory AWS credentials from the persisted store WITHOUT any refresh call. */
    buildCredentialsByStorage(): Promise<unknown>;
    getTokenSignature(): Promise<any>;
    getTokenStorage(): {
        getCachedOAuthToken(): Promise<{ identityToken?: string } | null>;
        saveOAuthToken(token: unknown): Promise<void> | void;
        /** Read-only: a relay token bundle (creds + identity token + expiry) is persisted. */
        hasCachedToken(): Promise<boolean>;
        /** Read-only: the persisted bundle is past lemon's refresh horizon (expired_time). */
        shouldRefreshToken(): Promise<boolean>;
        /** Seeds the lemon config keys (x-lemon-identity flag, region) — the non-auth half of init(). */
        initLemonConfig(): Promise<void>;
    };
}

export const webTransport = WebCoreFactory.create({
    cloud: 'aws',
    project: WEB_ENV === 'local' ? `${WEB_PROJECT}_${WEB_ENV}` : WEB_PROJECT,
    oAuthEndpoint: WEB_OAUTH_ENDPOINT,
    region: WEB_REGION,
    storage: usePersistentWebStorage ? localStorage : sessionStorage,
}) as unknown as WebTransport;

// ---------------------------------------------------------------------------
// Sealed transport init + read-only session probes (2026-08 session audit §7 Phase 2-2).
//
// lemon-web-core's own `init()`/`isAuthenticated()` fire an HTTP token refresh whenever the stored
// `expired_time` has passed — a second refresh engine with no cap/single-flight that writes ONLY
// its own store, leaving relayCore and the socket SDK's signing material stale (the signature-error
// divergence). Refresh ownership belongs to the socket AuthController (its writeback re-mints these
// credentials), so the boot path is sealed: replicate init() minus the refresh, and expose
// read-only probes for callers that used to lean on isAuthenticated()'s side effects.
// ---------------------------------------------------------------------------

/**
 * Read-only: whether a relay session bundle is persisted. This is the boot "am I logged in"
 * question — session EXISTENCE. Credential validity is deliberately not part of it: stale
 * credentials recover through the socket refresh writeback (or requestSessionRefresh), and
 * flipping this to false on staleness would bounce a returning user to login over a recoverable
 * state.
 */
export const hasStoredRelaySession = (): Promise<boolean> => webTransport.getTokenStorage().hasCachedToken();

/**
 * Read-only: whether the persisted credentials are past lemon's refresh horizon. Unlike
 * `webTransport.isAuthenticated()` this NEVER fires a refresh — callers that find it true ask the
 * refresh owner instead (app-runtime `requestSessionRefresh`).
 */
export const isStoredSessionExpired = (): Promise<boolean> => webTransport.getTokenStorage().shouldRefreshToken();

/**
 * `webTransport.init()` minus its internal refresh: seed the lemon config keys, then rebuild the
 * in-memory AWS credentials from whatever the store holds. Possibly-stale credentials are still
 * built — signed requests need SOME signer, and the socket auth writeback replaces them the moment
 * the session re-verifies.
 */
const initWebTransportSealed = async (): Promise<void> => {
    const tokenStorage = webTransport.getTokenStorage();
    await tokenStorage.initLemonConfig();
    if (!(await tokenStorage.hasCachedToken())) {
        return;
    }
    try {
        await webTransport.buildCredentialsByStorage();
    } catch {
        // Partial/corrupt store (e.g. missing AccessKeyId) — boot without in-memory credentials;
        // the next login/writeback rebuilds them.
    }
};

let pendingInit: Promise<void> | null = null;
let initDone = false;

export const startWebTransportInit = (): Promise<void> => {
    if (initDone) return Promise.resolve();
    if (pendingInit) return pendingInit;
    pendingInit = initWebTransportSealed()
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
