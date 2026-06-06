/**
 * Parse the invite-login input. Accepts either:
 *  - a full new-pattern invite link: https://app-dev.chatic.io/s?code=invt:<id>:<uuid>&api=<id>&stage=<stage>
 *    (also tolerates a `backend` query param instead of api/stage)
 *  - a bare login code: invt:<id>:<uuid>
 *
 * Mirrors libs/deeplinks urlConverter's new-pattern branch (api/stage -> backend),
 * but stays Firestore-free so it works in the desktop web client.
 */
export interface ParsedInvite {
    /** Backend login code in `invt:<id>:<uuid>` form. */
    code: string;
    /** Optional backend (DOU) endpoint override derived from the link. */
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
