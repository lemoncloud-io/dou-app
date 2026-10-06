import { decodeInviteLink, isEncodedInviteUrl } from '@chatic/shared';

/**
 * Parse the invite-login input. Accepts, anywhere inside the pasted text (an SMS body, a chat
 * message), with or without a scheme:
 *  - the encoded link the server issues by default: https://app-dev.chatic.io/i?t=<base64url JSON>
 *    — opened by the shared decoder, which web and mobile already use.
 *  - a legacy invite link: https://app-dev.chatic.io/s?code=invt:<id>:<uuid>&api=<id>&stage=<stage>
 *    (also tolerates a `backend` query param instead of api/stage). One that names no address is a
 *    relay link.
 *  - a bare login code: invt:<id>:<uuid>
 *
 * The backend comes from whoever wrote the link; `isTrustedInviteBackend` decides whether it may be
 * used. Stays Firestore-free so it works in the desktop web client.
 */
export interface ParsedInvite {
    /** Backend login code in `invt:<id>:<uuid>` form. */
    code: string;
    /** Optional backend (DOU) endpoint override derived from the link. Not yet trusted. */
    backend?: string;
}

/**
 * Why a paste was turned down before anything was sent:
 *  - `format` — nothing usable in it.
 *  - `relay` — a relay-server (phone) invite. It has no address and needs a phone or email login
 *    this screen does not have, so sending it to the relay would only fail with a misleading
 *    "code isn't valid".
 *  - `unmarked` — an encoded link that names no server. An unmarked link must not be assumed to be
 *    a relay one (the issuer takes the separate `/i` path precisely so an old client does not).
 */
export interface RefusedInvite {
    refused: 'format' | 'relay' | 'unmarked';
}

const buildBackend = (api: string, stage: string): string =>
    `https://${api}.execute-api.ap-northeast-2.amazonaws.com/${stage}`;

/**
 * The first link in the text: an explicit scheme, or a dotted host followed by a path. A bare code
 * (`invt:1:abc`) has neither, so it never matches.
 */
const LINK = /(?:[a-z][a-z0-9+.-]*:\/\/|(?:[\w-]+\.)+[a-z]{2,}\/)\S*/gi;
/** Sentence punctuation that trails a link in a message and is not part of it. */
const TRAILING_PUNCTUATION = /[.,;:!)\]}'"]+$/;
/** The two paths an invite link takes: `/s` (query form) and `/i` (encoded form). */
const INVITE_PATH = /^\/[is]\/?$/;

const withScheme = (link: string): string => (link.includes('://') ? link : `https://${link}`);

const isInvitePath = (link: string): boolean => {
    try {
        return INVITE_PATH.test(new URL(link).pathname);
    } catch {
        return false;
    }
};

/**
 * The link to open: the first one on an invite path, else the first link at all (so a custom-scheme
 * or odd link still gets its own "no code" answer). A message that mentions another site before the
 * invite must not hide the invite.
 */
const findLink = (text: string): string | null => {
    const links = Array.from(text.matchAll(LINK), match => withScheme(match[0].replace(TRAILING_PUNCTUATION, '')));
    return links.find(isInvitePath) ?? links[0] ?? null;
};

const parseEncodedLink = (link: string): ParsedInvite | RefusedInvite => {
    const target = decodeInviteLink(link);
    if (!target) return { refused: 'format' };
    if (target.relay) return { refused: 'relay' };
    if (!target.backend) return { refused: 'unmarked' };
    return { code: target.code, backend: target.backend };
};

export const parseInviteInput = (input: string): ParsedInvite | RefusedInvite => {
    const trimmed = input.trim();
    if (!trimmed) return { refused: 'format' };

    const link = findLink(trimmed);
    // Bare code (no URL) — let loginWithInviteCode fall back to the env backend.
    if (!link) {
        return { code: trimmed };
    }

    if (isEncodedInviteUrl(link)) {
        return parseEncodedLink(link);
    }

    try {
        const parsed = new URL(link);
        const code = parsed.searchParams.get('code');
        if (!code) return { refused: 'format' };

        const backendParam = parsed.searchParams.get('backend') ?? undefined;
        const api = parsed.searchParams.get('api');
        const stage = parsed.searchParams.get('stage');
        // A relay server has no address, so a link that names none is a relay link whether or not it
        // says so — the same reading apps/web gives it.
        if (parsed.searchParams.has('relay') || !(backendParam || api || stage)) return { refused: 'relay' };
        // Half an address composes a host that does not exist.
        if (!backendParam && !(api && stage)) return { refused: 'format' };

        return { code, backend: backendParam ?? buildBackend(api as string, stage as string) };
    } catch {
        return { refused: 'format' };
    }
};

/**
 * The address a server-issued cloud invite composes from `api` + `stage` (and the one the shared
 * encoded-link decoder builds): an API Gateway id and a stage, nothing else. Anchored and
 * character-classed so a crafted `api=evil.example#` cannot move the host.
 */
const API_GATEWAY_BACKEND = /^https:\/\/[a-z0-9]+\.execute-api\.ap-northeast-2\.amazonaws\.com\/[\w-]+\/?$/;

const withoutTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

/**
 * Whether an invite link's backend may receive the invite exchange. The exchange is signed with
 * the device's guest delegation, so a pasted link that names any other server would hand that
 * delegation to whoever runs it. Accepted: the API Gateway shape real invite links carry, or a
 * backend this build is configured with (`configured`, empty entries ignored).
 */
export const isTrustedInviteBackend = (backend: string, configured: readonly string[]): boolean => {
    if (API_GATEWAY_BACKEND.test(backend)) return true;
    const target = withoutTrailingSlash(backend);
    return configured.some(url => !!url && withoutTrailingSlash(url) === target);
};
