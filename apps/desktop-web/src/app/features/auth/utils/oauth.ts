import { SOCIAL_OAUTH_ENDPOINT } from '@chatic/app-runtime';

/**
 * Social Login URL plumbing (ADR 0009). The OAuth Relay fronts every provider:
 * we send the browser to its authorize URL with a `redirect` back-address and
 * it returns `?code=&provider=` to that address. The hand-off page then ferries
 * the code into the app via the `chatic://oauth` deeplink when it lands in a
 * plain browser (the Desktop Shell registers the `chatic:` protocol).
 */
/**
 * Channel-scoped scheme: each deployment targets its own shell channel
 * (dev web → DoU Dev via `chatic-dev:`, prod web → DoU via `chatic:`), so an
 * OAuth hand-off never (re)launches the other channel's app.
 */
const PROTOCOL_SCHEME = import.meta.env.VITE_DESKTOP_PROTOCOL || 'chatic';
export const OAUTH_DEEPLINK_PREFIX = `${PROTOCOL_SCHEME}://oauth`;

/**
 * Social Login is dev-only for now: the backend can restore only OWNED clouds
 * (`/clouds/0/list?view=mine` filters by ownerId) — invite-joined memberships
 * don't follow the account yet, so the login promise doesn't hold in prod.
 * Flip when the joined-clouds endpoint lands.
 */
export const isSocialLoginEnabled = (): boolean => import.meta.env.VITE_ENV?.toUpperCase() !== 'PROD';
/** Both channels' prefixes parse — receiving is harmless, launching is what must not cross. */
const OAUTH_DEEPLINK_PREFIXES = ['chatic://oauth', 'chatic-dev://oauth'];

/** Relay authorize URL returning to this origin's hand-off page. */
export const buildAuthorizeUrl = (provider: string): string => {
    const redirect = `${window.location.origin}/auth/oauth-response`;
    return `${SOCIAL_OAUTH_ENDPOINT}/oauth/${provider}/authorize?redirect=${encodeURIComponent(redirect)}`;
};

/** Hand-off deeplink carrying the relay code back into the shell. */
export const buildOAuthDeeplink = (provider: string, code: string): string =>
    `${OAUTH_DEEPLINK_PREFIX}?${new URLSearchParams({ provider, code }).toString()}`;

export interface OAuthDeeplinkPayload {
    provider: string;
    code: string;
}

/** Parse a `chatic(-dev)://oauth?...` deeplink; null for any other deeplink. */
export const parseOAuthDeeplink = (url: string): OAuthDeeplinkPayload | null => {
    if (!OAUTH_DEEPLINK_PREFIXES.some(prefix => url.startsWith(prefix))) return null;
    const query = url.slice(url.indexOf('?') + 1);
    const params = new URLSearchParams(url.includes('?') ? query : '');
    const code = params.get('code') ?? '';
    if (!code) return null;
    return { provider: params.get('provider') || 'google', code };
};
