import { isInviteEntry, parseInviteDeeplink } from '../types';
import { ROUTES } from '../../../../routes/paths';

export const resolveInviteAcceptRedirect = (search: string): string | null => {
    if (!isInviteEntry(parseInviteDeeplink(search))) return null;
    const query = search.startsWith('?') ? search.slice(1) : search;
    return `${ROUTES.invite.accept}?${query}`;
};
