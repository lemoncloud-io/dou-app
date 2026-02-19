import axios from 'axios';

import type { AxiosRequestConfig, AxiosResponse } from 'axios';

const TOKEN_KEY = 'chatic-token';

interface RequestBuilder {
    setBody: (body: unknown) => RequestBuilder;
    setParams: (params: Record<string, unknown>) => RequestBuilder;
    execute: <T>() => Promise<AxiosResponse<T>>;
}

interface SimpleWebCore {
    saveToken: (token: string) => void;
    getToken: () => string | null;
    clearToken: () => void;
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
                if (token) {
                    config.headers = {
                        ...config.headers,
                        'x-lemon-identity': token,
                    };
                }

                return axios.request<T>(config);
            },
        };

        return builder;
    },
};
