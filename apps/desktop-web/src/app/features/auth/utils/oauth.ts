import { config } from '@chatic/config';

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
 *
 * Read per call rather than once at module load. `config.get()` answers `undefined` until
 * `config.init()` runs (main.tsx), so a module-scope read that landed before boot would fall
 * back to the registry default and hand a dev build off to the PROD channel's app — silently,
 * and in exactly the direction this scheme exists to prevent. Every caller here runs from a
 * rendered component, which is always after boot.
 */
const protocolScheme = (): string => config.get<string>('net.deeplink.desktopProtocol') ?? 'chatic';

/**
 * Social Login is dev-only for now: the backend can restore only OWNED clouds
 * (`/clouds/0/list?view=mine` filters by ownerId) — invite-joined memberships
 * don't follow the account yet, so the login promise doesn't hold in prod.
 * Flip when the joined-clouds endpoint lands.
 */
export const isSocialLoginEnabled = (): boolean => config.get<boolean>('feature.auth.socialLogin') !== false;
/** Both channels' prefixes parse — receiving is harmless, launching is what must not cross. */
const OAUTH_DEEPLINK_PREFIXES = ['chatic://oauth', 'chatic-dev://oauth'];

// Already lowercased by the registry (`net.socialOauth.endpoint`'s `envDefaultKey` reader lowers
// this raw name — see `webEnvAdapter.ts`'s `LOWERED_RAW_NAMES`), matching what
// `@chatic/web-config`'s `WEB_SOCIAL_OAUTH_ENDPOINT` always did. Read per call, for the same
// boot-order reason as the scheme above.
const socialOauthEndpoint = (): string => config.get<string>('net.socialOauth.endpoint') ?? '';

/** Relay authorize URL returning to this origin's hand-off page. */
export const buildAuthorizeUrl = (provider: string): string => {
    const redirect = `${window.location.origin}/auth/oauth-response`;
    return `${socialOauthEndpoint()}/oauth/${provider}/authorize?redirect=${encodeURIComponent(redirect)}`;
};

/** Hand-off deeplink carrying the relay code back into the shell. */
export const buildOAuthDeeplink = (provider: string, code: string): string =>
    `${protocolScheme()}://oauth?${new URLSearchParams({ provider, code }).toString()}`;

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
