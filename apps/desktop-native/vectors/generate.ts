import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import axios from 'axios';

import { LemonHmacSigner } from '../../../libs/auth/src/signing';
import { signRequest } from '../../../libs/http/src/signing/sigV4';
import { createRequestTransport } from '../../../libs/http/src/transport/requestTransport';

type Vector = { name: string } & Record<string, unknown>;
type VectorFile = { source: string; vectors: Vector[] };

const OUT_DIR = join(process.cwd(), 'apps/desktop-native/vectors');
const signer = new LemonHmacSigner();

const signingFile = (): VectorFile => {
    const material = [
        { name: 'relay', authId: 'auth-relay-id', accountId: 'account-relay-1', identityId: 'identity-relay-1' },
        { name: 'cloud', authId: 'token-authid-cloud-1', accountId: 'account-cloud-1', identityId: 'identity-cloud-1' },
        { name: 'unicode-user-agent', authId: 'a', accountId: 'b', identityId: 'c' },
        { name: 'empty-identity', authId: 'auth-relay-id', accountId: 'account-relay-1', identityId: '' },
    ];
    const clocks = [
        { current: '2026-08-27T00:00:00.000Z', userAgent: 'fixture-ua/1.0' },
        { current: '2026-08-27T00:00:00.001Z', userAgent: 'fixture-ua/1.0' },
        { current: '2026-11-26T09:41:07.123Z', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) 한글 é' },
    ];
    const vectors = material.flatMap(m =>
        clocks.map((c, i) => ({
            name: `${m.name}-${i}`,
            authId: m.authId,
            accountId: m.accountId,
            identityId: m.identityId,
            current: c.current,
            userAgent: c.userAgent,
            signature: signer.sign(m, c).signature,
        }))
    );
    return { source: 'libs/auth/src/signing/LemonHmacSigner.ts', vectors };
};

const CREDENTIAL = { accessKey: 'AKIAFIXTUREKEY0001', secretKey: 'fixture/secret+key0123456789ABCDEFghijkl' };
const SESSION_CREDENTIAL = { ...CREDENTIAL, sessionToken: 'fixture-session-token//with+chars==' };
const NOW = '2026-11-26T09:41:07.123Z';

type SigCase = {
    name: string;
    credential: typeof CREDENTIAL | typeof SESSION_CREDENTIAL;
    endpoint: string;
    method: string;
    params?: Record<string, unknown>;
    body?: unknown;
};

const sigv4Cases: SigCase[] = [
    { name: 'get-no-params', credential: CREDENTIAL, endpoint: 'https://relay.example.test/pairings', method: 'get' },
    {
        name: 'get-params-sorted-and-escaped',
        credential: CREDENTIAL,
        endpoint: 'https://relay.example.test:8443/v1/users/me',
        method: 'get',
        params: { zeta: 'a b', alpha: "it's (1)*!", token: 1, flag: true, 한글: '값' },
    },
    {
        name: 'post-object-body',
        credential: SESSION_CREDENTIAL,
        endpoint: 'https://relay.example.test/pairings/0/request',
        method: 'post',
        body: { purpose: 'web', deviceId: 'dev-1', client: { name: 'Chrome · macOS', platform: 'macOS' } },
    },
    {
        name: 'post-no-body',
        credential: CREDENTIAL,
        endpoint: 'https://relay.example.test/pairings/abc/claim',
        method: 'post',
    },
    {
        name: 'post-empty-object',
        credential: CREDENTIAL,
        endpoint: 'https://relay.example.test/x',
        method: 'post',
        body: {},
    },
    {
        name: 'path-with-unicode-and-specials',
        credential: SESSION_CREDENTIAL,
        endpoint: "https://relay.example.test/a b/한글/it's/(x)*!~",
        method: 'put',
        body: { text: 'line1\nline2\t"quoted" \\ \x01 한글 😀' },
    },
    {
        name: 'delete-with-params',
        credential: CREDENTIAL,
        endpoint: 'https://relay.example.test/rooms/9',
        method: 'delete',
        params: { force: 'yes' },
    },
];

const sigv4File = (): VectorFile => ({
    source: 'libs/http/src/signing/sigV4.ts',
    vectors: sigv4Cases.map(c => ({
        ...c,
        region: 'ap-northeast-2',
        now: NOW,
        headers: signRequest({
            credential: c.credential,
            region: 'ap-northeast-2',
            endpoint: c.endpoint,
            method: c.method,
            params: c.params,
            body: c.body,
            now: new Date(NOW),
        }),
    })),
});

const withFixedClock = async <T>(iso: string, run: () => Promise<T>): Promise<T> => {
    const RealDate = Date;
    class FixedDate extends RealDate {
        constructor(...args: unknown[]) {
            super(...((args.length === 0 ? [iso] : args) as [string]));
        }
        static now(): number {
            return new RealDate(iso).getTime();
        }
    }
    globalThis.Date = FixedDate as DateConstructor;
    try {
        return await run();
    } finally {
        globalThis.Date = RealDate;
    }
};

type Captured = { method?: string; url: string; headers: Record<string, unknown>; data?: unknown };

const captureTransport = (credential: typeof CREDENTIAL | null, identity: string | null) => {
    let captured: Captured | null = null;
    const instance = axios.create({
        adapter: async config => {
            captured = {
                method: config.method,
                url: instance.getUri(config),
                headers: config.headers.toJSON() as Record<string, unknown>,
                data: config.data,
            };
            return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
        },
    });
    const transport = createRequestTransport(
        { credential: () => credential, identityToken: () => identity, region: () => 'ap-northeast-2' },
        instance
    );
    return { transport, read: (): Captured => captured as Captured };
};

type RequestCase = {
    name: string;
    signed: boolean;
    method: string;
    baseURL: string;
    params?: Record<string, unknown>;
    body?: unknown;
    noCredential?: boolean;
};

const requestCases: RequestCase[] = [
    {
        name: 'unsigned-post-register-device',
        signed: false,
        method: 'POST',
        baseURL: 'https://relay.example.test/oauth/register-device',
        body: { deviceId: 'dev-1' },
    },
    {
        name: 'unsigned-post-params',
        signed: false,
        method: 'POST',
        baseURL: 'https://relay.example.test/oauth/login-user',
        params: { token: 1, email: 'true' },
        body: { a: 1 },
    },
    { name: 'signed-get', signed: true, method: 'GET', baseURL: 'https://relay.example.test/pairings' },
    {
        name: 'signed-get-params',
        signed: true,
        method: 'GET',
        baseURL: 'https://relay.example.test/users',
        params: { q: 'a b,c:d', page: 2 },
    },
    {
        name: 'signed-post-body',
        signed: true,
        method: 'POST',
        baseURL: 'https://relay.example.test/pairings/0/request',
        body: { purpose: 'web', deviceId: 'dev-1' },
    },
    {
        name: 'signed-post-no-body',
        signed: true,
        method: 'POST',
        baseURL: 'https://relay.example.test/pairings/abc/claim',
    },
    {
        name: 'signed-without-credential',
        signed: true,
        method: 'POST',
        baseURL: 'https://relay.example.test/x',
        body: { a: 'b' },
        noCredential: true,
    },
];

const requestsFile = async (): Promise<VectorFile> => {
    const vectors: Vector[] = [];
    for (const c of requestCases) {
        const identity = 'fixture-identity-token';
        const { transport, read } = captureTransport(c.noCredential ? null : SESSION_CREDENTIAL, identity);
        await withFixedClock(NOW, async () => {
            const make = c.signed ? transport.buildSignedRequest : transport.buildRequest;
            const builder = make({ method: c.method, baseURL: c.baseURL });
            if (c.params) builder.setParams(c.params);
            if (c.body !== undefined) builder.setBody(c.body);
            await builder.execute();
        });
        const got = read();
        vectors.push({
            name: c.name,
            signed: c.signed,
            method: c.method,
            baseURL: c.baseURL,
            params: c.params ?? null,
            body: c.body ?? null,
            credential: c.noCredential ? null : SESSION_CREDENTIAL,
            identityToken: identity,
            region: 'ap-northeast-2',
            now: NOW,
            expected: { method: got.method, url: got.url, headers: got.headers, data: got.data ?? null },
        });
    }
    return { source: 'libs/http/src/transport/requestTransport.ts', vectors };
};

const FILES: Record<string, () => VectorFile | Promise<VectorFile>> = {
    'signing.json': signingFile,
    'http-sigv4.json': sigv4File,
    'http-requests.json': requestsFile,
};

const render = (file: VectorFile): string => `${JSON.stringify(file, null, 2)}\n`;

const main = async (): Promise<void> => {
    const check = process.argv.includes('--check');
    const drifted: string[] = [];
    for (const [name, build] of Object.entries(FILES)) {
        const path = join(OUT_DIR, name);
        const next = render(await build());
        if (check) {
            let current = '';
            try {
                current = readFileSync(path, 'utf8');
            } catch {
                current = '';
            }
            if (current.replace(/\r\n/g, '\n') !== next) drifted.push(name);
        } else {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, next);
        }
    }
    if (drifted.length > 0) {
        console.error(`vectors out of date: ${drifted.join(', ')} — run: npx nx run desktop-native:vectors`);
        process.exit(1);
    }
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
