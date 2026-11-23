import { decodeInviteLink, isEncodedInviteUrl } from '@chatic/shared';

export interface ParsedInvite {
    code: string;
    backend?: string;
}

export interface RefusedInvite {
    refused: 'format' | 'relay' | 'unmarked';
}

const buildBackend = (api: string, stage: string): string =>
    `https://${api}.execute-api.ap-northeast-2.amazonaws.com/${stage}`;

const LINK = /(?:[a-z][a-z0-9+.-]*:\/\/|(?:[\w-]+\.)+[a-z]{2,}\/)\S*/gi;
const TRAILING_PUNCTUATION = /[.,;:!)\]}'"]+$/;
const INVITE_PATH = /^\/[is]\/?$/;

const withScheme = (link: string): string => (link.includes('://') ? link : `https://${link}`);

const isInvitePath = (link: string): boolean => {
    try {
        return INVITE_PATH.test(new URL(link).pathname);
    } catch {
        return false;
    }
};

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
        if (parsed.searchParams.has('relay') || !(backendParam || api || stage)) return { refused: 'relay' };
        if (!backendParam && !(api && stage)) return { refused: 'format' };

        return { code, backend: backendParam ?? buildBackend(api as string, stage as string) };
    } catch {
        return { refused: 'format' };
    }
};

const API_GATEWAY_BACKEND = /^https:\/\/[a-z0-9]+\.execute-api\.ap-northeast-2\.amazonaws\.com\/[\w-]+\/?$/;

const withoutTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export const isTrustedInviteBackend = (backend: string, configured: readonly string[]): boolean => {
    if (API_GATEWAY_BACKEND.test(backend)) return true;
    const target = withoutTrailingSlash(backend);
    return configured.some(url => !!url && withoutTrailingSlash(url) === target);
};
