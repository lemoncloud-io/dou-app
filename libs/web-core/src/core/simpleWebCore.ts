import axios from 'axios';

import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { AWSCredentials } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import { signAwsRequest } from '../utils/func';

export const TOKEN_KEY = 'chatic-token';
export const CREDENTIAL_KEY = 'chatic-credential';
export const SELECTED_PLACE_KEY = 'chatic-selected-place';
export const WS_ENDPOINT_KEY = 'chatic-ws-endpoint';

interface RequestBuilder {
    setBody: (body: unknown) => RequestBuilder;
    setParams: (params: Record<string, unknown>) => RequestBuilder;
    execute: <T>() => Promise<AxiosResponse<T>>;
}

interface SimpleWebCore {
    saveToken: (token: string) => void;
    getToken: () => string | null;
    clearToken: () => void;
    saveCredential: (credential: AWSCredentials) => void;
    getCredential: () => AWSCredentials | null;
    saveSelectedPlaceId: (placeId: string) => void;
    getSelectedPlaceId: () => string | null;
    saveWsEndpoint: (wss: string) => void;
    buildRequest: (config: AxiosRequestConfig) => RequestBuilder;
}

export const simpleWebCore: SimpleWebCore = {
    saveToken: (token: string): void => {
        sessionStorage.setItem(TOKEN_KEY, token);
    },

    getToken: (): string | null => {
        return sessionStorage.getItem(TOKEN_KEY);
    },

    clearToken: (): void => {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(CREDENTIAL_KEY);
        sessionStorage.removeItem(SELECTED_PLACE_KEY);
        sessionStorage.removeItem(WS_ENDPOINT_KEY);
    },

    saveCredential: (credential: AWSCredentials): void => {
        sessionStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credential));
    },

    getCredential: (): AWSCredentials | null => {
        const raw = sessionStorage.getItem(CREDENTIAL_KEY);
        return raw ? (JSON.parse(raw) as AWSCredentials) : null;
    },

    saveSelectedPlaceId: (placeId: string): void => {
        sessionStorage.setItem(SELECTED_PLACE_KEY, placeId);
    },

    getSelectedPlaceId: (): string | null => {
        return sessionStorage.getItem(SELECTED_PLACE_KEY);
    },

    saveWsEndpoint: (wss: string): void => {
        sessionStorage.setItem(WS_ENDPOINT_KEY, wss);
    },

    buildRequest: (config: AxiosRequestConfig): RequestBuilder => {
        const token = simpleWebCore.getToken();

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
                const credential = simpleWebCore.getCredential();

                config.headers = {
                    ...config.headers,
                    ...(token && { 'x-lemon-identity': token }),
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
