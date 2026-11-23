import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export interface SigningCredential {
    accessKey: string;
    secretKey: string;
    sessionToken?: string;
}

export interface SignInput {
    credential: SigningCredential;
    region: string;
    endpoint: string;
    method: string;
    params?: Record<string, unknown>;
    body?: unknown;
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

const amzDate = (now: Date): string =>
    now
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z')
        .replace(/[:-]|\.\d{3}/g, '');

const hostOf = (url: string): string => {
    const host = url.indexOf('//') > -1 ? url.split('/')[2] : url.split('/')[0];
    return host.split(':')[0].split('?')[0];
};

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
