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
/** Both channels' schemes parse — receiving is harmless, launching is what must not cross. */
const OAUTH_DEEPLINK_SCHEMES = ['chatic:', 'chatic-dev:'];
const OAUTH_DEEPLINK_HOST = 'oauth';

/** Providers the relay flow is wired for. A deeplink naming anything else is not ours. */
const OAUTH_PROVIDERS = ['google'];

// Already lowercased by the registry (`net.socialOauth.endpoint`'s `envDefaultKey` reader lowers
// this raw name — see `webEnvAdapter.ts`'s `LOWERED_RAW_NAMES`), matching what
// `@chatic/web-config`'s `WEB_SOCIAL_OAUTH_ENDPOINT` always did. Read per call, for the same
// boot-order reason as the scheme above.
const socialOauthEndpoint = (): string => config.get<string>('net.socialOauth.endpoint') ?? '';

/**
 * Relay authorize URL returning to this origin's hand-off page. `nonce`, when given, rides the
 * `redirect` back-address; whether the relay returns it is unverified, so `start` does not send one
 * yet (see `evaluateOAuthDeeplink`).
 */
export const buildAuthorizeUrl = (provider: string, nonce?: string): string => {
    const handoff = new URL('/auth/oauth-response', window.location.origin);
    if (nonce) handoff.searchParams.set('nonce', nonce);
    return `${socialOauthEndpoint()}/oauth/${provider}/authorize?redirect=${encodeURIComponent(handoff.toString())}`;
};

/** Hand-off deeplink carrying the relay code back into the shell. */
export const buildOAuthDeeplink = (provider: string, code: string): string =>
    `${protocolScheme()}://oauth?${new URLSearchParams({ provider, code }).toString()}`;

export interface OAuthDeeplinkPayload {
    provider: string;
    code: string;
    /** Only present when the hand-off page ferried one back; see `evaluateOAuthDeeplink`. */
    nonce?: string;
}

/**
 * Parse a `chatic(-dev)://oauth?...` deeplink; null for any other deeplink, and for an OAuth one
 * that is malformed (no code, no provider, or a provider this flow does not know). Compared as a
 * parsed URL, not by prefix: `chatic://oauth.evil` and `chatic://oauth@evil` share the prefix and
 * are not the oauth host.
 */
export const parseOAuthDeeplink = (url: string): OAuthDeeplinkPayload | null => {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (!OAUTH_DEEPLINK_SCHEMES.includes(parsed.protocol)) return null;
    if (parsed.host.toLowerCase() !== OAUTH_DEEPLINK_HOST || parsed.username || parsed.password) return null;
    if (parsed.pathname !== '' && parsed.pathname !== '/') return null;

    const code = parsed.searchParams.get('code') ?? '';
    const provider = parsed.searchParams.get('provider') ?? '';
    if (!code || !OAUTH_PROVIDERS.includes(provider)) return null;
    const nonce = parsed.searchParams.get('nonce');
    return nonce ? { provider, code, nonce } : { provider, code };
};
