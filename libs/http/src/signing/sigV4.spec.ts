/**
 * @jest-environment node
 */
import { signRequest } from './sigV4';

/**
 * Golden signatures: each `expected` below was produced by lemon-web-core 1.5.3's own `sigV4Client`
 * (the signer this one replaces), with the same credential, region and a clock frozen at `NOW`. A
 * mismatch means the API Gateway would refuse the request — see the header comment in `sigV4.ts`.
 */
const NOW = new Date('2026-11-10T03:04:05.678Z');
const credential = { accessKey: 'AKIAEXAMPLE', secretKey: 'secret/Key+EXAMPLE', sessionToken: 'session-token-EXAMPLE' };

const GOLDEN = [
    {
        name: 'GET with no params',
        endpoint: 'https://api.example.com/v1/clouds/0/list',
        method: 'get',
        params: null,
        body: null,
        expected: {
            Accept: 'application/json',
            'x-amz-date': '20261110T030405Z',
            Authorization:
                'AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20261110/ap-northeast-2/execute-api/aws4_request, SignedHeaders=accept;host;x-amz-date, Signature=174c4e833b0c638c313a6e7f7f0aadb9f79b19355867e650776d5d2e7213b422',
            'x-amz-security-token': 'session-token-EXAMPLE',
            'Content-Type': 'application/json',
        },
    },
    {
        name: 'GET with params',
        endpoint: 'https://api.example.com/v1/subscriptions',
        method: 'get',
        params: {
            limit: 20,
            page: 0,
            q: 'hello world',
            tag: 'a*b(c)!',
        },
        body: null,
        expected: {
            Accept: 'application/json',
            'x-amz-date': '20261110T030405Z',
            Authorization:
                'AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20261110/ap-northeast-2/execute-api/aws4_request, SignedHeaders=accept;host;x-amz-date, Signature=e719efbb43b3fa906c323b00a74e040948693395f652d05d7167dede7dcda713',
            'x-amz-security-token': 'session-token-EXAMPLE',
            'Content-Type': 'application/json',
        },
    },
    {
        name: 'POST with a Korean body',
        endpoint: 'https://api.example.com/v1/users/0/invite',
        method: 'post',
        params: null,
        body: {
            name: '홍길동',
            phone: '+821012345678',
            list: [1, 2],
        },
        expected: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-amz-date': '20261110T030405Z',
            Authorization:
                'AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20261110/ap-northeast-2/execute-api/aws4_request, SignedHeaders=accept;content-type;host;x-amz-date, Signature=b69c583c0db88f183868fbee4091d3e53294b83e0a97fce81dd06d0cd3116912',
            'x-amz-security-token': 'session-token-EXAMPLE',
        },
    },
    {
        name: 'PUT with params and body',
        endpoint: 'https://api.example.com/d1/pairings/abc-123/approve',
        method: 'put',
        params: {
            force: true,
        },
        body: {
            note: 'ok',
        },
        expected: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-amz-date': '20261110T030405Z',
            Authorization:
                'AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20261110/ap-northeast-2/execute-api/aws4_request, SignedHeaders=accept;content-type;host;x-amz-date, Signature=c7f5c97f2cd34c7b0a1f14003ea54cd0e55b493bcfd94045290682618fae282b',
            'x-amz-security-token': 'session-token-EXAMPLE',
        },
    },
    {
        name: 'DELETE with no body',
        endpoint: 'https://api.example.com/v1/clouds/42',
        method: 'delete',
        params: {},
        body: null,
        expected: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-amz-date': '20261110T030405Z',
            Authorization:
                'AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20261110/ap-northeast-2/execute-api/aws4_request, SignedHeaders=accept;content-type;host;x-amz-date, Signature=7e0b194210100a2a06634ded4e655df09931a72a36a432083f6f37ab695299a1',
            'x-amz-security-token': 'session-token-EXAMPLE',
        },
    },
    {
        name: 'POST with an empty body object',
        endpoint: 'https://api.example.com/v1/report',
        method: 'post',
        params: null,
        body: {},
        expected: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-amz-date': '20261110T030405Z',
            Authorization:
                'AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20261110/ap-northeast-2/execute-api/aws4_request, SignedHeaders=accept;content-type;host;x-amz-date, Signature=de2121fa39e35669df1e70eb08408611ea7ca7b9ea752da076b5e117d18f3d30',
            'x-amz-security-token': 'session-token-EXAMPLE',
        },
    },
] as const;

describe('signRequest', () => {
    it.each(GOLDEN.map(c => [c.name, c] as const))('signs %s exactly as lemon-web-core did', (_, c) => {
        const headers = signRequest({
            credential,
            region: 'ap-northeast-2',
            endpoint: c.endpoint,
            method: c.method,
            params: (c.params ?? undefined) as Record<string, unknown> | undefined,
            body: c.body ?? undefined,
            now: NOW,
        });
        expect(headers).toEqual(c.expected);
    });

    it('leaves out the security token header when the credential has none', () => {
        const headers = signRequest({
            credential: { accessKey: 'AKIAEXAMPLE', secretKey: 'secret' },
            region: 'ap-northeast-2',
            endpoint: 'https://api.example.com/v1/x',
            method: 'get',
            now: NOW,
        });
        expect(headers['x-amz-security-token']).toBeUndefined();
        expect(headers['Authorization']).toContain('SignedHeaders=accept;host;x-amz-date');
    });
});
