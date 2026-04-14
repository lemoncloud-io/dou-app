import axios from 'axios';

import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { AWSCredentials } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import { calcSignature, signAwsRequest } from '../utils/func';
import { coreStorage } from './coreStorage';

export const CLOUD_DELEGATION_TOKEN_KEY = 'chatic-cloud-delegation-token';
export const CLOUD_TOKEN_KEY = 'chatic-cloud-token';
export const CLOUD_SELECTED_CLOUD_KEY = 'chatic-selected-cloud-id';
export const CLOUD_SELECTED_PLACE_KEY = 'chatic-selected-place-id';

interface RequestBuilder {
    setBody: (body: unknown) => RequestBuilder;
    setParams: (params: Record<string, unknown>) => RequestBuilder;
    execute: <T>() => Promise<AxiosResponse<T>>;
}

interface CloudCore {
    saveDelegationToken: (token: CloudDelegationTokenView) => void;
    getDelegationToken: () => CloudDelegationTokenView | null;
    saveCloudToken: (token: UserTokenView) => void;
    getCloudToken: () => UserTokenView | null;
    saveSelectedCloudId: (cloudId: string) => void;
    getSelectedCloudId: () => string | null;
    saveSelectedSiteId: (siteId: string) => void;
    clearSelectedPlace: () => void;
    getSelectedPlaceId: () => string | null;
    clearDelegationToken: () => void;
    clearSession: () => void;
    getBackend: () => string | null;
    getWss: () => string | null;
    getIdentityToken: () => string | null;
    getCredential: () => AWSCredentials | null;
    buildRequest: (config: AxiosRequestConfig) => RequestBuilder;
    refreshToken: (target?: string) => Promise<UserTokenView>;
}

export const cloudCore: CloudCore = {
    saveDelegationToken: (token: CloudDelegationTokenView): void => {
        coreStorage.set(CLOUD_DELEGATION_TOKEN_KEY, JSON.stringify(token));
    },

    getDelegationToken: (): CloudDelegationTokenView | null => {
        const raw = coreStorage.get(CLOUD_DELEGATION_TOKEN_KEY);
        return raw ? (JSON.parse(raw) as CloudDelegationTokenView) : null;
    },

    saveCloudToken: (token: UserTokenView): void => {
        coreStorage.set(CLOUD_TOKEN_KEY, JSON.stringify(token));
    },

    getCloudToken: (): UserTokenView | null => {
        const raw = coreStorage.get(CLOUD_TOKEN_KEY);
        return raw ? (JSON.parse(raw) as UserTokenView) : null;
    },

    saveSelectedCloudId: (cloudId: string): void => {
        coreStorage.set(CLOUD_SELECTED_CLOUD_KEY, cloudId);
    },

    getSelectedCloudId: (): string | null => {
        return coreStorage.get(CLOUD_SELECTED_CLOUD_KEY);
    },

    saveSelectedSiteId: (siteId: string): void => {
        coreStorage.set(CLOUD_SELECTED_PLACE_KEY, siteId);
    },

    clearSelectedPlace: (): void => {
        coreStorage.remove(CLOUD_SELECTED_PLACE_KEY);
    },

    getSelectedPlaceId: (): string | null => {
        return coreStorage.get(CLOUD_SELECTED_PLACE_KEY);
    },

    clearDelegationToken: (): void => {
        coreStorage.remove(CLOUD_DELEGATION_TOKEN_KEY);
        coreStorage.remove(CLOUD_TOKEN_KEY);
        coreStorage.remove(CLOUD_SELECTED_PLACE_KEY);
        coreStorage.set(CLOUD_SELECTED_CLOUD_KEY, 'default');
    },

    clearSession: (): void => {
        coreStorage.remove(CLOUD_DELEGATION_TOKEN_KEY);
        coreStorage.remove(CLOUD_TOKEN_KEY);
        coreStorage.remove(CLOUD_SELECTED_CLOUD_KEY);
        coreStorage.remove(CLOUD_SELECTED_PLACE_KEY);

        // Clear endpoint overrides from both storages (web uses sessionStorage, mobile uses localStorage)
        sessionStorage.removeItem('CHATIC_OAUTH_ENDPOINT');
        sessionStorage.removeItem('CHATIC_DOU_ENDPOINT');
        sessionStorage.removeItem('CHATIC_WS_ENDPOINT');
        localStorage.removeItem('CHATIC_OAUTH_ENDPOINT');
        localStorage.removeItem('CHATIC_DOU_ENDPOINT');
        localStorage.removeItem('CHATIC_WS_ENDPOINT');
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

    refreshToken: async (target?: string): Promise<UserTokenView> => {
        const token = cloudCore.getCloudToken();
        if (!token?.Token) throw new Error('No cloud token found');

        const { authId, accountId, identityId, identityToken } = token.Token;
        if (!authId || !accountId || !identityId || !identityToken) {
            throw new Error('Missing token fields for refresh');
        }

        const current = new Date().toISOString();
        const signature = calcSignature({ authId, accountId, identityId, identityToken: '' }, current);

        const backend = cloudCore.getBackend();
        const { data: refreshed } = await cloudCore
            .buildRequest({
                method: 'POST',
                baseURL: `${backend}/oauth/${authId}/refresh`,
            })
            .setParams({ token: 1 })
            .setBody({ current, signature, ...(target && { target }) })
            .execute<UserTokenView>();

        cloudCore.saveCloudToken(refreshed);
        return refreshed;
    },

    buildRequest: (config: AxiosRequestConfig): RequestBuilder => {
        const builder: RequestBuilder = {
            setBody: (body: unknown) => {
                config.data = body;
                return builder;
            },

            setParams: (params: Record<string, unknown>) => {
                config.params = params;
                return builder;
            },

            execute: async <T>(): Promise<AxiosResponse<T>> => {
                const identityToken = cloudCore.getIdentityToken();
                const credential = cloudCore.getCredential();

                config.headers = {
                    ...config.headers,
                    ...(identityToken && { 'x-lemon-identity': identityToken }),
                };

                if (credential) {
                    config = await signAwsRequest(config, credential);
                }

                return axios.request<T>(config);
            },
        };

        return builder;
    },
};
