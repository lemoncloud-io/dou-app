export interface InviteLinkTarget {
    code: string;
    relay: boolean;
    backend?: string;
}

const INVITE_BACKEND_REGION = 'ap-northeast-2';

const PARSE_BASE = 'https://chatic.invalid';

const parseUrl = (url: string): URL | null => {
    try {
        return new URL(url, PARSE_BASE);
    } catch {
        return null;
    }
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const base64UrlToBytes = (value: string): number[] | null => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;

    for (const char of normalized) {
        if (char === '=') {
            break;
        }
        const index = BASE64_ALPHABET.indexOf(char);
        if (index < 0) {
            return null;
        }
        buffer = (buffer << 6) | index;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 0xff);
        }
    }

    return bytes;
};

const utf8BytesToString = (bytes: number[]): string | null => {
    let out = '';
    let index = 0;

    while (index < bytes.length) {
        const lead = bytes[index++];
        let codePoint: number;
        let continuations: number;

        if (lead < 0x80) {
            codePoint = lead;
            continuations = 0;
        } else if ((lead & 0xe0) === 0xc0) {
            codePoint = lead & 0x1f;
            continuations = 1;
        } else if ((lead & 0xf0) === 0xe0) {
            codePoint = lead & 0x0f;
            continuations = 2;
        } else if ((lead & 0xf8) === 0xf0) {
            codePoint = lead & 0x07;
            continuations = 3;
        } else {
            return null;
        }

        if (index + continuations > bytes.length) {
            return null;
        }
        for (let step = 0; step < continuations; step++) {
            const byte = bytes[index++];
            if ((byte & 0xc0) !== 0x80) {
                return null;
            }
            codePoint = (codePoint << 6) | (byte & 0x3f);
        }

        if (codePoint > 0x10ffff) {
            return null;
        }
        out += String.fromCodePoint(codePoint);
    }

    return out;
};

export const isEncodedInviteUrl = (url: string): boolean => {
    const parsed = parseUrl(url);
    return !!parsed && (parsed.pathname === '/i' || parsed.pathname === '/i/');
};

export type InviteLinkFailure = 'missing' | 'alphabet' | 'utf8' | 'json' | 'shape';

export interface InviteLinkReading {
    target: InviteLinkTarget | null;
    failedAt?: InviteLinkFailure;
    length: number;
    ignoredChars: number;
}

const TOKEN_PREFIX = /^[A-Za-z0-9\-_+/]*=*/;

const readTokenParam = (parsed: URL): string => {
    try {
        return parsed.searchParams.get('t') ?? '';
    } catch {
        return /[?&]t=([^&#]*)/.exec(parsed.search)?.[1] ?? '';
    }
};

export const readInviteLink = (url: string): InviteLinkReading => {
    const parsed = parseUrl(url);
    const raw = parsed ? readTokenParam(parsed) : '';
    const token = TOKEN_PREFIX.exec(raw)?.[0] ?? '';
    const shape = { length: raw.length, ignoredChars: raw.length - token.length };
    const fail = (failedAt: InviteLinkFailure): InviteLinkReading => ({ target: null, failedAt, ...shape });

    if (!raw) {
        return fail('missing');
    }

    const bytes = token ? base64UrlToBytes(token) : null;
    if (!bytes) {
        return fail('alphabet');
    }
    const json = utf8BytesToString(bytes);
    if (json === null) {
        return fail('utf8');
    }

    let payload: unknown;
    try {
        payload = JSON.parse(json);
    } catch {
        return fail('json');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return fail('shape');
    }

    const { c, r, a, s } = payload as Record<string, unknown>;

    const code = typeof c === 'string' ? c.trim() : '';
    if (!code) {
        return fail('shape');
    }

    if (r) {
        return { target: { code, relay: true }, ...shape };
    }

    const api = typeof a === 'string' ? a.trim() : '';
    const stage = typeof s === 'string' ? s.trim() : '';
    if (!api || !stage) {
        return { target: { code, relay: false }, ...shape };
    }

    return {
        target: {
            code,
            relay: false,
            backend: `https://${api}.execute-api.${INVITE_BACKEND_REGION}.amazonaws.com/${stage}`,
        },
        ...shape,
    };
};

export const decodeInviteLink = (url: string): InviteLinkTarget | null => readInviteLink(url).target;
