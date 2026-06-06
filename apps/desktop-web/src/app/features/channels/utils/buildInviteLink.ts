import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

/**
 * Resolve a shareable invite-link URL from a MyInviteView.
 *
 * The server normally returns the fully-formed deep link in `Location` (the
 * same `https://<app>/s?code=invt:...&api=...&stage=...` form that our
 * invite-login parser, parseInviteInput, consumes). We return that verbatim.
 *
 * Fallback (server omitted Location): assemble `<origin>/s?code=<code>` and
 * append the backend endpoint from `$envs.backend` as the `backend` query param
 * — parseInviteInput accepts `backend` directly in place of `api`/`stage`.
 * Returns null if neither a Location nor a usable code is available.
 */
export const buildInviteLink = (invite: MyInviteView): string | null => {
    if (invite.Location) return invite.Location;

    if (!invite.code) return null;

    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const url = new URL('/s', origin || 'https://app.chatic.io');
    url.searchParams.set('code', invite.code);

    const backend = invite.$envs?.backend;
    if (backend) url.searchParams.set('backend', backend);

    return url.toString();
};
