import axios from 'axios';

import { signRequest } from '../signing/sigV4';

import type { SigningCredential } from '../signing/sigV4';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

/**
 * The relay's HTTP transport: a plain request, or one signed for the API Gateway's IAM auth.
 *
 * It holds nothing. Every signed request reads the credential and identity token at that moment
 * through `RequestSigningPorts`, which the assembly point binds to the session's relay token — so a
 * token the socket renewed is the one the very next request signs with, and there is no second copy
 * to fill, empty or let drift (this replaces lemon-web-core, which kept its own copy and its own
 * expiry clock).
 *
 * The request shape is the one lemon-web-core sent, kept so the gateway and the server see nothing
 * new: a JSON `Content-Type`, the SigV4 headers from `signRequest`, and `x-lemon-identity` carrying
 * the identity token, which the server reads to know who is calling.
 */
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
    /** The relay credential, or null when there is none — the request then goes unsigned, as lemon's did. */
    credential(): SigningCredential | null;
    /** Sent as `x-lemon-identity` with a signed request. */
    identityToken(): string | null;
    region(): string;
    /** Told when a signed request had to go out unsigned. */
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

/**
 * Builds the transport. `axiosInstance` is shared by every request it builds; the caller owns the
 * singleton.
 */
export const createRequestTransport = (
    signing: RequestSigningPorts,
    axiosInstance: AxiosInstance = axios.create()
): RequestTransport => ({
    buildRequest: config => new RequestBuilder(config, axiosInstance, null),
    buildSignedRequest: config => new RequestBuilder(config, axiosInstance, signing),
});
