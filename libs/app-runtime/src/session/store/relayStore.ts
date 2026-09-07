import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { storage } from '@chatic/shared';
import { JsonSlot, type StorageLike } from './jsonSlot';
import { sessionSignal, type ISessionSignal } from './signal';

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

const RELAY_SELECTED_SITE_KEY = 'chatic-relay-selected-site-id';
const RELAY_TOKEN_KEY = 'chatic-relay-token';

/**
 * The relay slot of the session store. Renamed off `RelayCore` — that name came from web-core's
 * `session/core` folder and sat outside this repo's `I*` contract convention (ADR-0076 결정 0).
 */
export interface IRelayStore {
    getBackend(): string;
    getWss(): string;
    getSelectedSiteId(): string | null;
    saveSelectedSiteId(siteId: string): void;
    clearSelectedSite(): void;
    saveRelayToken(token: UserTokenView): void;
    getRelayToken(): UserTokenView | null;
    getIdentityToken(): string | null;
    clearToken(): void;
    /** Injects endpoint resolution. Called by `session/store/configure.ts`; not part of the read surface. */
    configureEndpoints(resolvers: { backend: EndpointResolver; wss: EndpointResolver }): void;
}

class RelayStore implements IRelayStore {
    private resolveBackend: EndpointResolver = notConfigured('backend');
    private resolveWss: EndpointResolver = notConfigured('wss');
    private readonly token: JsonSlot<UserTokenView>;

    constructor(
        private readonly storage: StorageLike,
        private readonly signal: ISessionSignal
    ) {
        this.token = new JsonSlot(storage, RELAY_TOKEN_KEY);
    }

    configureEndpoints(resolvers: { backend: EndpointResolver; wss: EndpointResolver }): void {
        this.resolveBackend = resolvers.backend;
        this.resolveWss = resolvers.wss;
    }

    getBackend(): string {
        return this.resolveBackend();
    }

    getWss(): string {
        return this.resolveWss();
    }

    getSelectedSiteId(): string | null {
        return this.storage.get(RELAY_SELECTED_SITE_KEY);
    }

    saveSelectedSiteId(siteId: string): void {
        this.storage.set(RELAY_SELECTED_SITE_KEY, siteId);
        this.signal.emit('selection');
    }

    clearSelectedSite(): void {
        this.storage.remove(RELAY_SELECTED_SITE_KEY);
        this.signal.emit('selection');
    }

    saveRelayToken(token: UserTokenView): void {
        this.token.write(token);
        this.signal.emit('relay:token');
    }

    getRelayToken(): UserTokenView | null {
        return this.token.read();
    }

    getIdentityToken(): string | null {
        return this.getRelayToken()?.Token?.identityToken ?? null;
    }

    clearToken(): void {
        this.token.clear();
        this.signal.emit('relay:token');
    }
}

export const relayStore: IRelayStore = new RelayStore(storage, sessionSignal);
