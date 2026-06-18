import { getDynamicRelayBackend, getDynamicRelayWss } from '../transport/webTransport';
import { useWebCoreStore } from '../stores';
import { storage } from '@chatic/shared';

export const RELAY_SELECTED_SITE_KEY = 'chatic-relay-selected-site-id';

interface RelayCore {
    getBackend(): string;
    getWss(): string;
    getSelectedSiteId(): string | null;
    saveSelectedSiteId(siteId: string): void;
    clearSelectedSite(): void;
    isAuthenticated(): boolean;
}

export const relayCore: RelayCore = {
    getBackend: (): string => getDynamicRelayBackend(),
    getWss: (): string => getDynamicRelayWss(),
    getSelectedSiteId: (): string | null => storage.get(RELAY_SELECTED_SITE_KEY),
    saveSelectedSiteId: (siteId: string): void => {
        storage.set(RELAY_SELECTED_SITE_KEY, siteId);
    },
    clearSelectedSite: (): void => {
        storage.remove(RELAY_SELECTED_SITE_KEY);
    },
    isAuthenticated: (): boolean => useWebCoreStore.getState().isAuthenticated,
};
