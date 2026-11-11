import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

/**
 * The AWS SigV4 signature the relay's API Gateway (IAM auth) accepts, computed exactly as
 * lemon-web-core 1.5's vendored `sigV4Client` computed it.
 *
 * **Why a port and not a library.** That client is not a textbook SigV4: it signs `Accept` and
 * `Content-Type` alongside `host` and `x-amz-date`, hashes the body as `JSON.stringify` of whatever
 * the caller passed (`{}` for a request without one, except GET), and encodes the query and the path
 * with rules of its own. The gateway has been accepting exactly those bytes for years; a different
 * but correct signer would still disagree on a header set or an escape and every request would come
 * back as a bare network failure (the 403 carries no CORS header). So its output is kept byte for
 * byte, and `sigV4.spec.ts` pins it against signatures produced by lemon-web-core itself.
 *
 * Hashing is `@noble/hashes`, synchronous and pure JS: Web Crypto is only available in a secure
 * context, which a development build on an Android emulator (`http://10.0.2.2`) is not.
 */

export interface SigningCredential {
    accessKey: string;
    secretKey: string;
    /** Sent as `x-amz-security-token` when present. */
    sessionToken?: string;
}

export interface SignInput {
    credential: SigningCredential;
    region: string;
    /** The full request URL without its query: scheme, host and path. */
    endpoint: string;
    method: string;
    /** Signed as the canonical query string. */
    params?: Record<string, unknown>;
    /** Signed as `JSON.stringify(body)` (a string as is); ignored for GET. */
    body?: unknown;
    /** The signing instant. Defaults to now; tests pin it. */
    now?: Date;
}

const AWS_SHA_256 = 'AWS4-HMAC-SHA256';
const AWS4_REQUEST = 'aws4_request';
const AWS4 = 'AWS4';
const SERVICE = 'execute-api';
const DEFAULT_TYPE = 'application/json';

const toBytes = (value: string | Uint8Array): Uint8Array => (typeof value === 'string' ? utf8ToBytes(value) : value);
const hashHex = (value: string): string => bytesToHex(sha256(utf8ToBytes(value)));
const hmacBytes = (key: string | Uint8Array, value: string): Uint8Array =>
    hmac(sha256, toBytes(key), utf8ToBytes(value));

/** The path encoding lemon's client used: RFC 3986 unreserved kept, `/` kept, `*!()` forced. */
const uriEncode = (input: string): string => {
    let result = '';
    for (const ch of input) {
        if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || '_-~.'.includes(ch)) {
            result += ch;
        } else if (ch === '*') result += '%2A';
        else if (ch === '!') result += '%21';
        else if (ch === '(') result += '%28';
        else if (ch === ')') result += '%29';
        else if (ch === '/') result += ch;
        else result += encodeURIComponent(ch);
    }
    return result;
};

/** The query value encoding lemon's client used. */
const urlencode = (value: unknown): string =>
    encodeURIComponent(value as string)
        .replace(/!/g, '%21')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A');

const canonicalQuery = (params: Record<string, unknown>): string =>
    Object.keys(params)
        .sort()
        .map(key => `${key}=${urlencode(params[key])}`)
        .join('&');

const sortedHeaderNames = (headers: Record<string, string>): string[] => Object.keys(headers).sort();

const canonicalHeaders = (headers: Record<string, string>): string =>
    sortedHeaderNames(headers)
        .map(name => `${name.toLowerCase()}:${headers[name]}\n`)
        .join('');

const signedHeaderNames = (headers: Record<string, string>): string =>
    Object.keys(headers)
        .map(name => name.toLowerCase())
        .sort()
        .join(';');

/** `20261110T030405Z` — ISO 8601 basic, seconds precision. */
const amzDate = (now: Date): string =>
    now
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z')
        .replace(/[:-]|\.\d{3}/g, '');

const hostOf = (url: string): string => {
    const host = url.indexOf('//') > -1 ? url.split('/')[2] : url.split('/')[0];
    return host.split(':')[0].split('?')[0];
};

/**
 * The headers to send with the request: `Accept`, `Content-Type`, `x-amz-date`, `Authorization` and,
 * with a session token, `x-amz-security-token`. The request itself still carries its own query and
 * body; only the signature is computed here.
 */
export const signRequest = ({
    credential,
    region,
    endpoint,
    method,
    params,
    body,
    now = new Date(),
}: SignInput): Record<string, string> => {
    const verb = method.toUpperCase();
    const origin = /(^https?:\/\/[^/]+)/.exec(endpoint)?.[1] ?? '';
    const path = endpoint.substring(origin.length);
    const query = params ?? {};

    const headers: Record<string, string> = { 'Content-Type': DEFAULT_TYPE, Accept: DEFAULT_TYPE };
    // lemon's request builder handed the signer `body || {}`, so a missing (or falsy) body signs as `{}`
    // — except for GET, where the signer itself blanks it.
    const given = body || {};
    const payload =
        verb === 'GET' ? '' : typeof given === 'object' && given !== null ? JSON.stringify(given) : String(given);
    if (payload === '') delete headers['Content-Type'];

    const datetime = amzDate(now);
    headers['x-amz-date'] = datetime;
    headers['host'] = hostOf(endpoint);

    const canonicalRequest = [
        verb,
        uriEncode(path),
        canonicalQuery(query),
        canonicalHeaders(headers),
        signedHeaderNames(headers),
        hashHex(payload),
    ].join('\n');

    const scope = `${datetime.substring(0, 8)}/${region}/${SERVICE}/${AWS4_REQUEST}`;
    const stringToSign = [AWS_SHA_256, datetime, scope, hashHex(canonicalRequest)].join('\n');
    const signingKey = [datetime.substring(0, 8), region, SERVICE, AWS4_REQUEST].reduce<Uint8Array | string>(
        (key, part) => hmacBytes(key, part),
        AWS4 + credential.secretKey
    );
    const signature = bytesToHex(hmacBytes(signingKey, stringToSign));

    headers['Authorization'] =
        `${AWS_SHA_256} Credential=${credential.accessKey}/${scope}, SignedHeaders=${signedHeaderNames(headers)}, Signature=${signature}`;
    if (credential.sessionToken) headers['x-amz-security-token'] = credential.sessionToken;
    delete headers['host'];
    if (headers['Content-Type'] === undefined) headers['Content-Type'] = DEFAULT_TYPE;
    return headers;
};
