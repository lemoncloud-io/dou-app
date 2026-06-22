import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { getDynamicRelayBackend, getDynamicRelayWss } from '../../transport';
import { storage } from '@chatic/shared';
import { notifySessionStateChanged } from '../utils';

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

export const relayCore: RelayCore = {
    getBackend: (): string => getDynamicRelayBackend(),
    getWss: (): string => getDynamicRelayWss(),
    getSelectedSiteId: (): string | null => storage.get(RELAY_SELECTED_SITE_KEY),
    saveSelectedSiteId: (siteId: string): void => {
        storage.set(RELAY_SELECTED_SITE_KEY, siteId);
        notifySessionStateChanged();
    },
    clearSelectedSite: (): void => {
        storage.remove(RELAY_SELECTED_SITE_KEY);
        notifySessionStateChanged();
    },
    saveRelayToken: (token: UserTokenView): void => {
        storage.set(RELAY_TOKEN_KEY, JSON.stringify(token));
        notifySessionStateChanged();
    },
    getRelayToken: (): UserTokenView | null => {
        const raw = storage.get(RELAY_TOKEN_KEY);
        return raw ? (JSON.parse(raw) as UserTokenView) : null;
    },
    getIdentityToken: (): string | null => {
        return relayCore.getRelayToken()?.Token?.identityToken ?? null;
    },
    clearToken: (): void => {
        storage.remove(RELAY_TOKEN_KEY);
        notifySessionStateChanged();
    },
};
