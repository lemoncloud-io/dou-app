import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { storage } from '@chatic/shared';
import { sessionSignal } from './signal';

/**
 * Endpoint resolution is INJECTED, not imported (ADR-0070 결정 1 규칙 2). The pre-move `relayStore`
 * imported `getDynamicRelayBackend`/`getDynamicRelayWss` directly — the single measured violation of
 * store passivity — which also meant the store transitively knew about env and the transport.
 *
 * Wiring lives in `session/store/configure.ts`, which `initAppRuntime()` runs from the app entry
 * (ADR-0070 5단계) — NOT a barrel import side effect any more. The observable behavior is unchanged:
 * deeplink overrides are honored because the resolvers are functions, read lazily per call.
 * Throwing rather than returning '' on an unconfigured read keeps a wiring mistake loud instead of
 * silently producing requests against an empty host.
 */
type EndpointResolver = () => string;

const notConfigured = (name: string): EndpointResolver => {
    return () => {
        throw new Error(`relayStore: ${name} resolver not injected — call initAppRuntime() from the app entry`);
    };
};

let resolveBackend: EndpointResolver = notConfigured('backend');
let resolveWss: EndpointResolver = notConfigured('wss');

/** Injects endpoint resolution. Called by `session/store/configure.ts`; not part of the read surface. */
export const configureRelayEndpoints = (resolvers: { backend: EndpointResolver; wss: EndpointResolver }): void => {
    resolveBackend = resolvers.backend;
    resolveWss = resolvers.wss;
};
export const RELAY_SELECTED_SITE_KEY = 'chatic-relay-selected-site-id';
export const RELAY_TOKEN_KEY = 'chatic-relay-token';

interface RelayCore {
    getBackend(): string;
    getWss(): string;
    getSelectedSiteId(): string | null;
    saveSelectedSiteId(siteId: string): void;
    clearSelectedSite(): void;
    saveRelayToken(token: UserTokenView): void;
    getRelayToken(): UserTokenView | null;
    getIdentityToken(): string | null;
    clearToken(): void;
}

export const relayStore: RelayCore = {
    getBackend: (): string => resolveBackend(),
    getWss: (): string => resolveWss(),
    getSelectedSiteId: (): string | null => storage.get(RELAY_SELECTED_SITE_KEY),
    saveSelectedSiteId: (siteId: string): void => {
        storage.set(RELAY_SELECTED_SITE_KEY, siteId);
        sessionSignal.emit('selection');
    },
    clearSelectedSite: (): void => {
        storage.remove(RELAY_SELECTED_SITE_KEY);
        sessionSignal.emit('selection');
    },
    saveRelayToken: (token: UserTokenView): void => {
        storage.set(RELAY_TOKEN_KEY, JSON.stringify(token));
        sessionSignal.emit('relay:token');
    },
    getRelayToken: (): UserTokenView | null => {
        const raw = storage.get(RELAY_TOKEN_KEY);
        return raw ? (JSON.parse(raw) as UserTokenView) : null;
    },
    getIdentityToken: (): string | null => {
        return relayStore.getRelayToken()?.Token?.identityToken ?? null;
    },
    clearToken: (): void => {
        storage.remove(RELAY_TOKEN_KEY);
        sessionSignal.emit('relay:token');
    },
};
