/**
 * Auth feature data shapes and deeplink parsing.
 *
 * Invite deeplinks carry the target cloud/site descriptor as query params. Extraction lives here
 * (a pure function) so pages stay thin and the parsing is unit-testable in isolation.
 */

/** Minimal descriptor shown on the invite-accept screen. */
export interface SiteInfo {
    id: string;
    name: string;
}

/** Parsed invite deeplink. `code`/`provider` come straight from the link; the rest are optional. */
export interface InviteParams {
    code: string | null;
    provider: string | null;
    backend?: string;
    wss?: string;
    cloudId?: string;
    cloudName?: string;
    siteId?: string;
    siteName?: string;
}

/** Extract invite parameters from a location search string (e.g. `location.search`). */
export const parseInviteDeeplink = (search: string): InviteParams => {
    const params = new URLSearchParams(search);
    const opt = (key: string): string | undefined => params.get(key) ?? undefined;
    return {
        code: params.get('code'),
        provider: params.get('provider'),
        backend: opt('_backend'),
        wss: opt('_wss'),
        cloudId: opt('_cloudId'),
        cloudName: opt('_cloudName'),
        siteId: opt('_siteId'),
        siteName: opt('_siteName'),
    };
};

/** True when the deeplink represents an invite login. */
export const isInviteDeeplink = (params: InviteParams): boolean =>
    !!params.code && params.provider === 'invite';

/** Best-effort descriptor for the invite-accept UI, derived purely from the deeplink. */
export const buildInviteSiteInfo = (params: InviteParams): SiteInfo => ({
    id: params.cloudId ?? params.siteId ?? params.code ?? '',
    name: params.cloudName ?? params.siteName ?? '',
});
