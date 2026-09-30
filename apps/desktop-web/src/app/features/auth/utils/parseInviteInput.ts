/**
 * Parse the invite-login input. Accepts either:
 *  - a full new-pattern invite link: https://app-dev.chatic.io/s?code=invt:<id>:<uuid>&api=<id>&stage=<stage>
 *    (also tolerates a `backend` query param instead of api/stage). The backend comes from
 *    whoever wrote the link; `isTrustedInviteBackend` decides whether it may be used.
 *  - a bare login code: invt:<id>:<uuid>
 *
 * Mirrors libs/deeplinks urlConverter's new-pattern branch (api/stage -> backend),
 * but stays Firestore-free so it works in the desktop web client.
 */
export interface ParsedInvite {
    /** Backend login code in `invt:<id>:<uuid>` form. */
    code: string;
    /** Optional backend (DOU) endpoint override derived from the link. Not yet trusted. */
    backend?: string;
}

const buildBackend = (api: string, stage: string): string =>
    `https://${api}.execute-api.ap-northeast-2.amazonaws.com/${stage}`;

export const parseInviteInput = (input: string): ParsedInvite | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Bare code (no URL) — let loginWithInviteCode fall back to the env backend.
    if (!trimmed.includes('://')) {
        return { code: trimmed };
    }

    try {
        const parsed = new URL(trimmed);
        const code = parsed.searchParams.get('code');
        if (!code) return null;

        const backendParam = parsed.searchParams.get('backend') ?? undefined;
        const api = parsed.searchParams.get('api');
        const stage = parsed.searchParams.get('stage');
        const backend = backendParam ?? (api && stage ? buildBackend(api, stage) : undefined);

        return { code, backend };
    } catch {
        return null;
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
