/**
 * `/i?t=<base64url(JSON)>` — the encoded invite link, decoded once for every entry point.
 *
 * The server issues invite links in two shapes. The older `/s?code=…&api=…&stage=…` spells the
 * target out in the query string; the newer `/i?t=…` packs the same values into a single opaque
 * token. This module is the only place that opens the token, so landing, mobile and the web all
 * resolve one link to one destination — three decoders would eventually disagree, and a decoder
 * that disagrees sends a user to a *different server*.
 *
 * What this module does NOT do is validate or authenticate the payload. Anyone holding the link can
 * open it, edit the address inside and re-encode it. That is equally true of `/s?api=…` today, it is
 * the server's call to change, and a check here would only look like protection.
 */

/** The decoded target. Every entry point reads this shape and nothing else. */
export interface InviteLinkTarget {
    /** `invt:<id>:<uuid>`. Carried whole — no entry point takes it apart. */
    code: string;
    /** Relay-server invite. Read from the payload's `r` only, never inferred from a missing address. */
    relay: boolean;
    /** REST address of a cloud invite. Undefined for relay links and for payloads with no coordinates. */
    backend?: string;
}

/** Region hosting the invite backend API Gateway, used to expand `a` + `s` into a full address. */
const INVITE_BACKEND_REGION = 'ap-northeast-2';

/**
 * Base used only to make a relative link (`/i?t=…`) parseable; it never reaches the result. The web
 * router hands over `location.search` with no origin, so requiring an absolute URL here would push
 * a hard-coded host into the app that has the least business knowing one.
 *
 * Custom schemes (`chatic://i?t=…`) are NOT handled here: an absolute URL overrides the base, and
 * `chatic://i` parses with `i` as the host and an empty path. Mobile normalizes to https before
 * calling in, which is what its own `/s` parsing already does.
 */
const PARSE_BASE = 'https://chatic.invalid';

const parseUrl = (url: string): URL | null => {
    try {
        return new URL(url, PARSE_BASE);
    } catch {
        return null;
    }
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64url → bytes, by hand.
 *
 * `atob` cannot do this job: it rejects the url-safe `-` and `_`, and it is not a language
 * guarantee — React Native ships no such polyfill, so whether it exists on device depends on the JS
 * engine build. Bytes decoded arithmetically behave identically in every engine, which is the point:
 * a decoder that works under jest and fails on a phone is the exact failure this link format has
 * already produced once.
 *
 * Padding is optional on the way in — the trailing `=` only tells a decoder where to stop, and a
 * bit-accumulating loop already knows. Leftover bits that do not complete a byte are dropped, as the
 * base64 encoding of any byte string leaves at most 4 such bits.
 *
 * @returns the decoded bytes, or null if the input holds anything outside the base64 alphabet
 */
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

/**
 * UTF-8 bytes → string, by hand, for the same reason as above: `TextDecoder` is absent from jsdom
 * (the test environment for two of the three consumers) and is not guaranteed on device either.
 * Invite payloads carry cloud and place names, which in this app are usually Korean, so a latin1
 * shortcut would mangle them rather than fail loudly.
 *
 * @returns the decoded string, or null if the bytes are not well-formed UTF-8
 */
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

        // Guarded rather than left to String.fromCodePoint, which throws on an out-of-range value —
        // this module answers null, it never throws.
        if (codePoint > 0x10ffff) {
            return null;
        }
        out += String.fromCodePoint(codePoint);
    }

    return out;
};

/**
 * Is this one of our encoded invite links?
 *
 * Path only. A `/i` with a missing or unreadable `t` is still *our* link, and the entry points owe
 * that case a different answer than they owe a link that was never ours — hence the split between
 * this and {@link decodeInviteLink}.
 */
export const isEncodedInviteUrl = (url: string): boolean => {
    const parsed = parseUrl(url);
    return !!parsed && (parsed.pathname === '/i' || parsed.pathname === '/i/');
};

/** Where reading a `t` token stopped. Named for the step that refused it, so a log can say which. */
export type InviteLinkFailure = 'missing' | 'alphabet' | 'utf8' | 'json' | 'shape';

/**
 * Everything learned from reading one encoded link: the target when there is one, and the token's
 * shape either way. The shape exists for diagnostics — it says what happened to a link without
 * carrying the token itself, which holds the invite code and must not reach a log.
 */
export interface InviteLinkReading {
    target: InviteLinkTarget | null;
    /** The step that refused the token. Absent when `target` is set. */
    failedAt?: InviteLinkFailure;
    /** Characters in `t` as it arrived — URL-decoded, unless the platform could not decode the query. */
    length: number;
    /** Characters dropped from the end of `t` because they cannot belong to a base64url token. */
    ignoredChars: number;
}

/**
 * The token proper: base64url, plus the standard alphabet's `+` and `/` the byte decoder also takes,
 * then optional padding. Anchored at the start, so it matches up to the first character no encoder
 * writes and leaves the rest.
 */
const TOKEN_PREFIX = /^[A-Za-z0-9\-_+/]*=*/;

/**
 * The `t` value of a parsed link.
 *
 * React Native's `URLSearchParams` runs every value in the query through `decodeURIComponent` and
 * throws on the first malformed escape anywhere in it — `…t=eyJ…%EC%9`, a percent-encoded character
 * cut in half by whatever damaged the link. The browser's never throws. When it does, `t` is taken
 * from the raw query instead: the token never contains `%`, so reading it undecoded and stopping at
 * the first `%` (as {@link TOKEN_PREFIX} does) loses nothing.
 */
const readTokenParam = (parsed: URL): string => {
    try {
        return parsed.searchParams.get('t') ?? '';
    } catch {
        return /[?&]t=([^&#]*)/.exec(parsed.search)?.[1] ?? '';
    }
};

/**
 * Reads the `t` token of an encoded invite link, reporting the token's shape alongside the result.
 *
 * Never throws. Landing's redirect hook catches errors into a silent `setLoading(false)`, so a
 * decoder that threw would leave the user staring at a page that has quietly given up. A null
 * `target` is the single "cannot read this" answer, and each entry point decides what to show for it.
 *
 * **Characters after the token are ignored.** A link pasted into a chat can arrive with whatever
 * followed it glued on — `…/i?t=eyJ…fQ입니다`, or a closing `)` or `.` — when the messenger's link
 * detection runs past the URL. Those characters can never be part of the token: the server encodes
 * with base64url, so nothing outside that alphabet is ever written into `t`. Reading up to the
 * first such character recovers the link exactly as issued instead of refusing it whole. Damage
 * inside the alphabet — a truncated token, letters glued straight on — still fails, at `utf8` or
 * `json`, because the bytes no longer form the payload.
 *
 * Payload keys, all optional except `c`:
 * - `c` → `code`. Missing means null: an invite with no code has nothing to accept.
 * - `r` → `relay`. Truthy wins outright — a relay server has no address, so `a`/`s` alongside it
 *   are ignored rather than composed into one.
 * - `a` + `s` → `backend`, but only together. Half an address composes a host that does not exist,
 *   so one without the other is treated as no address at all.
 */
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
    // A JSON array or scalar decodes fine and carries nothing we can use; treat it as unreadable.
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

/** Opens the `t` token of an encoded invite link — {@link readInviteLink} without the shape. */
export const decodeInviteLink = (url: string): InviteLinkTarget | null => readInviteLink(url).target;
