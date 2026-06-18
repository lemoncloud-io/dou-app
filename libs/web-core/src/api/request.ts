import { cloudCore, DOU_ENDPOINT, getDynamicDOUEndpoint, OAUTH_ENDPOINT, webCore } from '../core';

import type { AxiosRequestConfig, Method } from 'axios';

export type ApiRequestMethod = Method;

export interface ApiRequestOptions<TBody = unknown, TParams = Record<string, unknown>> {
    method: ApiRequestMethod;
    baseURL: string;
    body?: TBody;
    params?: TParams;
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

/**
 * Executes a relay request without authentication signing.
 */
export const executeRelayRequest = async <TResponse, TBody = unknown, TParams = Record<string, unknown>>({
    method,
    baseURL,
    body,
    params,
}: ApiRequestOptions<TBody, TParams>): Promise<TResponse> => {
    const request = webCore.buildRequest({
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
    const request = webCore.buildSignedRequest({
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
    const request = cloudCore.buildRequest({
        method,
        baseURL,
    } as AxiosRequestConfig);

    if (params) request.setParams(params as Record<string, unknown>);
    if (body !== undefined) request.setBody(body as any);

    const { data } = await request.execute<TResponse & { error?: string }>();
    return throwIfApiError(data);
};
