import { isInviteEntry, parseInviteDeeplink } from '../types';
import { ROUTES } from '../../../../routes/paths';

/**
 * Where an invite-carrying query string should be sent, or `null` when it carries no invite.
 *
 * Every way into the web app funnels an invite through a query string — the landing page and the
 * native converter both build `/auth/login?provider=invite&…`, the `/s` route converts a raw share
 * link, and already-installed app versions keep producing `/?provider=invite&…` forever. Rather than
 * teach each entry point where the accept screen lives, they all ask this.
 *
 * The search string is carried across verbatim rather than re-serialized from the parsed params:
 * anything we do not model (utm_*, ref, …) survives the hop, and `isInviteEntry` stays the single
 * definition of "is this an invite".
 *
 * @param search the raw query string (`location.search`), with or without the leading `?`
 * @returns the `/invite/accept?…` target, or `null` to leave the caller's own routing alone
 */
export const resolveInviteAcceptRedirect = (search: string): string | null => {
    if (!isInviteEntry(parseInviteDeeplink(search))) return null;
    const query = search.startsWith('?') ? search.slice(1) : search;
    return `${ROUTES.invite.accept}?${query}`;
};
