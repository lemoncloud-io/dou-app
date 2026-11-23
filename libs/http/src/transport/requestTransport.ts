import axios from 'axios';

import { signRequest } from '../signing/sigV4';

import type { SigningCredential } from '../signing/sigV4';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

export interface TransportRequestBuilder {
    setBody: (body: unknown) => TransportRequestBuilder;
    setParams: (params: Record<string, unknown>) => TransportRequestBuilder;
    execute: <T>() => Promise<{ data: T }>;
}

export interface RequestTransport {
    buildRequest(config: AxiosRequestConfig): TransportRequestBuilder;
    buildSignedRequest(config: AxiosRequestConfig): TransportRequestBuilder;
}

export interface RequestSigningPorts {
    credential(): SigningCredential | null;
    identityToken(): string | null;
    region(): string;
    onUnsigned?(): void;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

class RequestBuilder implements TransportRequestBuilder {
    private config: AxiosRequestConfig;

    constructor(
        config: AxiosRequestConfig,
        private readonly axiosInstance: AxiosInstance,
        private readonly signing: RequestSigningPorts | null
    ) {
        if (!config.method) throw new Error('method should be defined!');
        if (!config.baseURL) throw new Error('baseURL should be defined!');
        this.config = { method: 'get', ...config, headers: { ...JSON_HEADERS, ...(config.headers ?? {}) } };
    }

    setBody(body: unknown): TransportRequestBuilder {
        this.config.data = body;
        return this;
    }

    setParams(params: Record<string, unknown>): TransportRequestBuilder {
        this.config.params = params;
        return this;
    }

    async execute<T>(): Promise<{ data: T }> {
        const headers = this.signing ? this.signedHeaders(this.signing) : {};
        return this.axiosInstance.request<T>({ ...this.config, headers: { ...this.config.headers, ...headers } });
    }

    private signedHeaders(signing: RequestSigningPorts): Record<string, string> {
        const credential = signing.credential();
        if (!credential) {
            signing.onUnsigned?.();
            return {};
        }
        const signed = signRequest({
            credential,
            region: signing.region(),
            endpoint: this.config.baseURL as string,
            method: (this.config.method ?? 'get').toLowerCase(),
            params: this.config.params as Record<string, unknown> | undefined,
            body: this.config.data,
        });
        const identity = signing.identityToken();
        return {
            ...signed,
            ...(this.config.headers as Record<string, string>),
            ...(identity ? { 'x-lemon-identity': identity } : {}),
        };
    }
}

export const createRequestTransport = (
    signing: RequestSigningPorts,
    axiosInstance: AxiosInstance = axios.create()
): RequestTransport => ({
    buildRequest: config => new RequestBuilder(config, axiosInstance, null),
    buildSignedRequest: config => new RequestBuilder(config, axiosInstance, signing),
});
