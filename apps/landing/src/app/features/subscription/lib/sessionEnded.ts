import { ROUTES } from '../../../routes/paths';

/**
 * Where a page goes when the session turns out to have ended: the sign-in page, saying why, with the
 * page it was on as the way back. `undefined` when it is already on a sign-in page — sending it there
 * again would only lose the `next` it already carries.
 */
export const sessionEndedRedirect = (location: { pathname: string; search: string }): string | undefined => {
    const { login } = ROUTES.subscription;
    if (location.pathname === login || location.pathname.startsWith(`${login}/`)) return undefined;
    const query = new URLSearchParams({ reason: 'session-ended', next: `${location.pathname}${location.search}` });
    return `${login}?${query}`;
};

/** The sign-in page for a reader with no session, coming back to `next` afterwards. */
export const signInRedirect = (location: { pathname: string; search: string }): string =>
    `${ROUTES.subscription.login}?${new URLSearchParams({ next: `${location.pathname}${location.search}` })}`;
