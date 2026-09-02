import { setStorageAdapter } from '@chatic/shared';

/**
 * Web runtime configuration — the ONLY module in the repo that reads `import.meta.env` / `window.*`
 * for endpoints and build identifiers (ADR-0070 결정 6, `@chatic/web-config` 신설).
 *
 * Moved verbatim out of `web-core/src/transport/webTransport.ts` (lines 1-120 pre-move), which mixed
 * env resolution with the lemon transport instance. Isolating it here is what lets every other module
 * stay free of `import.meta` — and therefore importable from a ts-jest (`module: commonjs`) test,
 * which is the structural fix behind ADR-0070 결정 1 규칙 2 ("env 주입").
 *
 * **This lib is env and nothing else.** The lemon transport instance briefly lived next door here
 * because it needs four of these values and this was the only leaf its two consumers could both
 * bite; it now belongs to `@chatic/http` (construction + boot policy) and
 * `app-runtime/src/http/transport.ts` (values + singleton). Nothing with a lifecycle goes back in
 * here — a `WEB_*` reader must not pay for an SDK instance, a token store or a boot.
 *
 * **Module-load side effects are an ordering contract.** They run top-to-bottom in this file and must
 * keep that order:
 *   1. `initEnvFromQueryParams()` — captures `?_backend` / `?_wss` deeplink overrides into
 *      sessionStorage BEFORE any endpoint getter can read them.
 *   2. `usePersistentWebStorage` + `setStorageAdapter` — picks the storage backing for the whole app.
 *   3. `clearTokensOnLogout()` — honors `?logout=1` before any token is read.
 *   4. `WEB_*` constants — plain reads, no side effects.
 * Anything importing this module gets 1-4 already done; `app-runtime/src/http/transport.ts` relies
 * on that (it builds the lemon client from `WEB_*` and the chosen storage). Do not split this file
 * without preserving the order.
 *
 * This lib is deliberately NOT ts-jest testable (it *is* the `import.meta` holder) and has no
 * jest.config — consumers mock `@chatic/web-config` instead.
 */

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

/** i18n language-storage key. Shared with `clearTokensOnLogout`, which must preserve it. */
export const LANGUAGE_KEY = 'i18nextLng';

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
        const languageKeySuffix = `.${LANGUAGE_KEY}`;
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
export const WEB_IAP_ENDPOINT = import.meta.env.VITE_IAP_ENDPOINT || '';

/** Relay backend, honoring runtime overrides (deeplink `?_backend`, then `window.DOU_ENDPOINT`). */
export const getDynamicRelayBackend = (): string => {
    return (
        getEndpointStorageItem('CHATIC_DOU_ENDPOINT') || window.DOU_ENDPOINT || import.meta.env.VITE_DOU_ENDPOINT || ''
    );
};

/** Relay wss, honoring runtime overrides (deeplink `?_wss`, then `window.WS_ENDPOINT`). */
export const getDynamicRelayWss = (): string => {
    return getEndpointStorageItem('CHATIC_WS_ENDPOINT') || window.WS_ENDPOINT || import.meta.env.VITE_WS_ENDPOINT || '';
};
