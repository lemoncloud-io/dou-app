import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { JsonSlot } from './jsonSlot';
import { plainPort, secretPort, type StoragePortPair } from './ports';
import { sessionSignal, type ISessionSignal } from './signal';

type EndpointResolver = () => string;

const notConfigured = (name: string): EndpointResolver => {
    return () => {
        throw new Error(`relayStore: ${name} resolver not injected — call createRuntime() from the app entry`);
    };
};

const RELAY_SELECTED_SITE_KEY = 'chatic-relay-selected-site-id';
const RELAY_TOKEN_KEY = 'chatic-relay-token';

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
    configureEndpoints(resolvers: { backend: EndpointResolver; wss: EndpointResolver }): void;
}

class RelayStore implements IRelayStore {
    private resolveBackend: EndpointResolver = notConfigured('backend');
    private resolveWss: EndpointResolver = notConfigured('wss');
    private readonly token: JsonSlot<UserTokenView>;

    private readonly storage: StoragePortPair['plain'];

    constructor(
        ports: StoragePortPair,
        private readonly signal: ISessionSignal
    ) {
        this.storage = ports.plain;
        this.token = new JsonSlot(ports.secret, RELAY_TOKEN_KEY);
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

export const relayStore: IRelayStore = new RelayStore({ secret: secretPort, plain: plainPort }, sessionSignal);
