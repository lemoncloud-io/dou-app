import axios from 'axios';
import { cloudCore, DOU_ENDPOINT, getDynamicDOUEndpoint, OAUTH_ENDPOINT } from '../../core';
import { webTransport } from '../../transport';
import { signAwsRequest } from './func';

import type { AxiosRequestConfig, AxiosResponse, Method } from 'axios';

export type ApiRequestMethod = Method;

export interface ApiRequestOptions<TBody = unknown, TParams = Record<string, unknown>> {
    method: ApiRequestMethod;
    baseURL: string;
    body?: TBody;
    params?: TParams;
}

interface CloudRequestBuilder {
    setBody: (body: unknown) => CloudRequestBuilder;
    setParams: (params: Record<string, unknown>) => CloudRequestBuilder;
    execute: <T>() => Promise<AxiosResponse<T>>;
}

/**
 * Shared API error guard used by domain libraries.
 */
export const throwIfApiError = <T>(data: T & { error?: string }): T => {
    if (data.error) throw new Error(data.error);
    return data;
};

/**
 * Static relay endpoint from environment.
 */
export const getCoreEndpoint = (): string => DOU_ENDPOINT;

/**
 * Relay endpoint that respects runtime overrides such as deeplink backend injection.
 */
export const getDynamicDouEndpoint = (): string => getDynamicDOUEndpoint();

/**
 * Static OAuth endpoint from environment.
 */
export const getOAuthEndpoint = (): string => OAUTH_ENDPOINT;

/**
 * Static IAP endpoint from environment.
 */
export const getIapEndpoint = (): string => import.meta.env.VITE_IAP_ENDPOINT || '';

const buildCloudRequest = (requestConfig: AxiosRequestConfig): CloudRequestBuilder => {
    let config = requestConfig;

    const builder: CloudRequestBuilder = {
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
};

/**
 * Executes a relay request without authentication signing.
 */
export const executeRelayRequest = async <TResponse, TBody = unknown, TParams = Record<string, unknown>>({
    method,
    baseURL,
    body,
    params,
}: ApiRequestOptions<TBody, TParams>): Promise<TResponse> => {
    const request = webTransport.buildRequest({
        method,
        baseURL,
    } as AxiosRequestConfig);

    if (params) request.setParams(params as Record<string, unknown>);
    if (body !== undefined) request.setBody(body as any);

    const { data } = await request.execute<TResponse & { error?: string }>();
    return throwIfApiError(data);
};

/**
 * Executes a relay request that requires the current signed web credentials.
 */
export const executeSignedRelayRequest = async <TResponse, TBody = unknown, TParams = Record<string, unknown>>({
    method,
    baseURL,
    body,
    params,
}: ApiRequestOptions<TBody, TParams>): Promise<TResponse> => {
    const request = webTransport.buildSignedRequest({
        method,
        baseURL,
    } as AxiosRequestConfig);

    if (params) request.setParams(params as Record<string, unknown>);
    if (body !== undefined) request.setBody(body as any);

    const { data } = await request.execute<TResponse & { error?: string }>();
    return throwIfApiError(data);
};

/**
 * Executes a cloud-scoped request signed with the current delegated cloud credentials.
 */
export const executeCloudRequest = async <TResponse, TBody = unknown, TParams = Record<string, unknown>>({
    method,
    baseURL,
    body,
    params,
}: ApiRequestOptions<TBody, TParams>): Promise<TResponse> => {
    const request = buildCloudRequest({
        method,
        baseURL,
    } as AxiosRequestConfig);

    if (params) request.setParams(params as Record<string, unknown>);
    if (body !== undefined) request.setBody(body as any);

    const { data } = await request.execute<TResponse & { error?: string }>();
    return throwIfApiError(data);
};
