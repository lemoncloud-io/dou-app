import { ROUTES } from '../../../routes/paths';

export const sessionEndedRedirect = (location: { pathname: string; search: string }): string | undefined => {
    const { login } = ROUTES.subscription;
    if (location.pathname === login || location.pathname.startsWith(`${login}/`)) return undefined;
    const query = new URLSearchParams({ reason: 'session-ended', next: `${location.pathname}${location.search}` });
    return `${login}?${query}`;
};

export const signInRedirect = (location: { pathname: string; search: string }): string =>
    `${ROUTES.subscription.login}?${new URLSearchParams({ next: `${location.pathname}${location.search}` })}`;
