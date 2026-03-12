import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import hmacSHA256 from 'crypto-js/hmac-sha256.js';
import encBase64 from 'crypto-js/enc-base64.js';

import type { AxiosRequestConfig } from 'axios';
import type { AWSCredentials } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

interface SignaturePayload {
    authId: string;
    accountId: string;
    identityId: string;
    identityToken: string;
}

const hmac = (message: string, key: string) => encBase64.stringify(hmacSHA256(message, key));

export const calcSignature = (
    payload: SignaturePayload,
    current: string = new Date().toISOString(),
    userAgent: string = navigator.userAgent
): string => {
    const data = [current, payload.accountId, payload.identityId, '', userAgent].join('&');
    return hmac(hmac(hmac(data, payload.authId), payload.accountId), payload.identityId);
};

const AWS_REGION = 'ap-northeast-2';
const AWS_SERVICE = 'execute-api';

function getFullUrl(config: AxiosRequestConfig): URL {
    const target = config.url ?? config.baseURL;

    if (!target) {
        throw new Error('AWS signing failed: request url is missing');
    }

    return new URL(target);
}

function appendConfigParamsToUrl(fullUrl: URL, params?: Record<string, unknown>) {
    if (!params) return;

    Object.entries(params).forEach(([key, value]) => {
        if (value == null) return;

        if (Array.isArray(value)) {
            value.forEach(item => {
                if (item != null) {
                    fullUrl.searchParams.append(key, String(item));
                }
            });
            return;
        }

        fullUrl.searchParams.set(key, String(value));
    });
}

function normalizeQuery(params: URLSearchParams): Record<string, string | string[]> {
    const query: Record<string, string | string[]> = {};

    params.forEach((value, key) => {
        const existing = query[key];

        if (existing === undefined) {
            query[key] = value;
            return;
        }

        if (Array.isArray(existing)) {
            existing.push(value);
            return;
        }

        query[key] = [existing, value];
    });

    return query;
}

function buildRequestBody(data: unknown): string | undefined {
    if (data == null) return undefined;
    if (typeof data === 'string') return data;
    if (data instanceof FormData) {
        throw new Error('AWS signing failed: FormData body is not supported');
    }

    return JSON.stringify(data);
}

function getHeaderValue(headers: AxiosRequestConfig['headers'], key: string): string | undefined {
    if (!headers) return undefined;

    const entries = Object.entries(headers as Record<string, unknown>);
    const found = entries.find(([headerKey]) => headerKey.toLowerCase() === key.toLowerCase());

    return found?.[1] != null ? String(found[1]) : undefined;
}

export async function signAwsRequest(
    config: AxiosRequestConfig,
    credential: AWSCredentials
): Promise<AxiosRequestConfig> {
    const fullUrl = getFullUrl(config);
    appendConfigParamsToUrl(fullUrl, config.params as Record<string, unknown> | undefined);

    const method = (config.method ?? 'GET').toUpperCase();
    const body = buildRequestBody(config.data);
    const accept = getHeaderValue(config.headers, 'accept') ?? 'application/json';

    const headersForSigning: Record<string, string> = {
        accept,
        host: fullUrl.host,
    };

    const signer = new SignatureV4({
        service: AWS_SERVICE,
        region: AWS_REGION,
        sha256: Sha256,
        applyChecksum: false,
        credentials: {
            accessKeyId: credential.AccessKeyId as string,
            secretAccessKey: credential.SecretKey as string,
        },
    });

    const request = new HttpRequest({
        protocol: fullUrl.protocol,
        hostname: fullUrl.hostname,
        port: fullUrl.port ? Number(fullUrl.port) : undefined,
        method,
        path: fullUrl.pathname,
        query: normalizeQuery(fullUrl.searchParams),
        headers: headersForSigning,
        body,
    });

    const signedRequest = await signer.sign(request);

    const safeSignedHeaders = Object.fromEntries(
        Object.entries(signedRequest.headers).filter(
            ([key]) => key.toLowerCase() !== 'host' && key.toLowerCase() !== 'x-amz-content-sha256'
        )
    );

    return {
        ...config,
        url: fullUrl.toString(),
        headers: {
            ...config.headers,
            accept,
            ...safeSignedHeaders,
            ...(credential.SessionToken && {
                'x-amz-security-token': credential.SessionToken,
            }),
        },
        data: body ?? config.data,
    };
}
