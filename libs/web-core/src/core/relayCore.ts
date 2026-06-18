import { getDynamicRelayBackend, getDynamicRelayWss } from '../transport';
import { storage } from '@chatic/shared';
import { notifySessionStateChanged } from '../session';

export const RELAY_SELECTED_SITE_KEY = 'chatic-relay-selected-site-id';

interface RelayCore {
    getBackend(): string;
    getWss(): string;
    getSelectedSiteId(): string | null;
    saveSelectedSiteId(siteId: string): void;
    clearSelectedSite(): void;
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
};
