import axios from 'axios';

import type { LemonOAuthToken } from '@lemoncloud/lemon-web-core';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

const TOKEN_KEY = 'chatic-token';

interface RequestBuilder {
    setBody: (body: unknown) => RequestBuilder;
    setParams: (params: Record<string, unknown>) => RequestBuilder;
    execute: <T>() => Promise<AxiosResponse<T>>;
}

interface SimpleWebCore {
    saveToken: (token: LemonOAuthToken) => void;
    getToken: () => LemonOAuthToken | null;
    clearToken: () => void;
    buildRequest: (config: AxiosRequestConfig) => RequestBuilder;
}

export const simpleWebCore: SimpleWebCore = {
    saveToken: (token: LemonOAuthToken): void => {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    },

    getToken: (): LemonOAuthToken | null => {
        const stored = sessionStorage.getItem(TOKEN_KEY);
        return stored ? JSON.parse(stored) : null;
    },

    clearToken: (): void => {
        sessionStorage.removeItem(TOKEN_KEY);
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
                if (token?.identityToken) {
                    config.headers = {
                        ...config.headers,
                        'x-lemon-identity': token?.identityToken,
                    };
                }

                return axios.request<T>(config);
            },
        };

        return builder;
    },
};
