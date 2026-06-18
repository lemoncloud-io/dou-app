import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { AWSCredentials } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import { storage } from '@chatic/shared';
import { notifySessionStateChanged } from '../session';

export const CLOUD_IS_ACTIVE_KEY = 'chatic-cloud-is-active';
export const CLOUD_DELEGATION_TOKEN_KEY = 'chatic-cloud-delegation-token';
export const CLOUD_TOKEN_KEY = 'chatic-cloud-token';
export const CLOUD_SELECTED_CLOUD_KEY = 'chatic-selected-cloud-id';
export const CLOUD_SELECTED_PLACE_KEY = 'chatic-selected-place-id';
export const CLOUD_PLACE_ORDER_KEY_PREFIX = 'chatic-place-order-';
export const CLOUD_INVITED_BUNDLES_KEY = 'chatic-invited-clouds';

interface CloudCore {
    getIsActive: () => boolean;
    setIsActive: (isActive: boolean) => void;
    saveDelegationToken: (token: CloudDelegationTokenView) => void;
    getDelegationToken: () => CloudDelegationTokenView | null;
    saveCloudToken: (token: UserTokenView) => void;
    getCloudToken: () => UserTokenView | null;
    saveSelectedCloudId: (cloudId: string) => void;
    getSelectedCloudId: () => string | null;
    saveSelectedSiteId: (siteId: string) => void;
    getSelectedSiteId: () => string | null;
    clearSelectedSite: () => void;
    clearSelectedPlace: () => void;
    getSelectedPlaceId: () => string | null;
    clearDelegationToken: () => void;
    clearSession: () => void;
    getBackend: () => string | null;
    getWss: () => string | null;
    getIdentityToken: () => string | null;
    getCredential: () => AWSCredentials | null;
    savePlaceOrder: (cloudId: string, order: string[]) => void;
    getPlaceOrder: (cloudId: string) => string[] | null;
    clearPlaceOrder: (cloudId: string) => void;
}

export const cloudCore: CloudCore = {
    getIsActive: (): boolean => {
        const raw = storage.get(CLOUD_IS_ACTIVE_KEY);
        return raw ? (JSON.parse(raw) as boolean) : false;
    },
    setIsActive: (isActive: boolean) => {
        storage.set(CLOUD_IS_ACTIVE_KEY, JSON.stringify(isActive));
    },
    saveDelegationToken: (token: CloudDelegationTokenView): void => {
        storage.set(CLOUD_DELEGATION_TOKEN_KEY, JSON.stringify(token));
        notifySessionStateChanged();
    },

    getDelegationToken: (): CloudDelegationTokenView | null => {
        const raw = storage.get(CLOUD_DELEGATION_TOKEN_KEY);
        return raw ? (JSON.parse(raw) as CloudDelegationTokenView) : null;
    },

    saveCloudToken: (token: UserTokenView): void => {
        storage.set(CLOUD_TOKEN_KEY, JSON.stringify(token));
        notifySessionStateChanged();
    },

    getCloudToken: (): UserTokenView | null => {
        const raw = storage.get(CLOUD_TOKEN_KEY);
        return raw ? (JSON.parse(raw) as UserTokenView) : null;
    },

    saveSelectedCloudId: (cloudId: string): void => {
        storage.set(CLOUD_SELECTED_CLOUD_KEY, cloudId);
        notifySessionStateChanged();
    },

    getSelectedCloudId: (): string | null => {
        return storage.get(CLOUD_SELECTED_CLOUD_KEY);
    },

    saveSelectedSiteId: (siteId: string): void => {
        storage.set(CLOUD_SELECTED_PLACE_KEY, siteId);
        notifySessionStateChanged();
    },

    getSelectedSiteId: (): string | null => {
        return storage.get(CLOUD_SELECTED_PLACE_KEY);
    },

    clearSelectedSite: (): void => {
        storage.remove(CLOUD_SELECTED_PLACE_KEY);
        notifySessionStateChanged();
    },

    clearSelectedPlace: (): void => {
        cloudCore.clearSelectedSite();
    },

    getSelectedPlaceId: (): string | null => {
        return cloudCore.getSelectedSiteId();
    },

    savePlaceOrder: (cloudId: string, order: string[]): void => {
        storage.set(`${CLOUD_PLACE_ORDER_KEY_PREFIX}${cloudId}`, JSON.stringify(order));
    },

    getPlaceOrder: (cloudId: string): string[] | null => {
        const raw = storage.get(`${CLOUD_PLACE_ORDER_KEY_PREFIX}${cloudId}`);
        return raw ? (JSON.parse(raw) as string[]) : null;
    },

    clearPlaceOrder: (cloudId: string): void => {
        storage.remove(`${CLOUD_PLACE_ORDER_KEY_PREFIX}${cloudId}`);
        notifySessionStateChanged();
    },

    clearDelegationToken: (): void => {
        storage.remove(CLOUD_DELEGATION_TOKEN_KEY);
        storage.remove(CLOUD_TOKEN_KEY);
        storage.remove(CLOUD_SELECTED_PLACE_KEY);
        storage.set(CLOUD_SELECTED_CLOUD_KEY, 'default');
        notifySessionStateChanged();
    },

    clearSession: (): void => {
        storage.remove(CLOUD_DELEGATION_TOKEN_KEY);
        storage.remove(CLOUD_TOKEN_KEY);
        storage.remove(CLOUD_SELECTED_CLOUD_KEY);
        storage.remove(CLOUD_SELECTED_PLACE_KEY);
        storage.remove(CLOUD_INVITED_BUNDLES_KEY);
        notifySessionStateChanged();
    },

    getBackend: (): string | null => {
        return cloudCore.getDelegationToken()?.backend ?? null;
    },

    getWss: (): string | null => {
        return cloudCore.getDelegationToken()?.wss ?? null;
    },

    getIdentityToken: (): string | null => {
        return cloudCore.getCloudToken()?.Token?.identityToken ?? null;
    },

    getCredential: (): AWSCredentials | null => {
        const token = cloudCore.getCloudToken();
        return (token?.Token?.credential as AWSCredentials) ?? null;
    },
};
