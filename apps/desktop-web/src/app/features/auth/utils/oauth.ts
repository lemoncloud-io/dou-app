import { config } from '@chatic/config';

/**
 * Social Login URL plumbing. The OAuth Relay fronts every provider: we send the browser to its
 * authorize URL with a `redirect` back-address and it returns `?code=&provider=` to that address.
 * The nonce of the start record rides that address and has to come back with the code; a hand-off
 * that arrives without it is shown as a failure rather than passed on. The hand-off page then
 * ferries the code and the nonce into the app via the `chatic://oauth` deeplink when it lands in a
 * plain browser (the Desktop Shell registers the `chatic:` protocol).
 */
/**
 * Channel-scoped scheme: each deployment targets its own shell channel
 * (dev web → DoU Dev via `chatic-dev:`, prod web → DoU via `chatic:`), so an
 * OAuth hand-off never (re)launches the other channel's app. The registry resolves the scheme
 * from the stage — the same axis the shell picks its own scheme by — so no build variable is involved.
 *
 * Read per call rather than once at module load. `config.get()` answers `undefined` until
 * `config.init()` runs (main.tsx), so a module-scope read that landed before boot would fall
 * back to the registry default and hand a dev build off to the PROD channel's app — silently,
 * and in exactly the direction this scheme exists to prevent. Every caller here runs from a
 * rendered component, which is always after boot.
 */
const protocolScheme = (): string => config.get<string>('net.deeplink.desktopProtocol') ?? 'chatic';

/**
 * Social sign-in: on in every build. A registry key rather than a constant so it can be turned off
 * without a release once a server lane writes it. Read per call — `config.get()` answers nothing
 * until boot has run `config.init()`.
 */
export const isSocialLoginEnabled = (): boolean => config.get<boolean>('feature.auth.socialLogin') !== false;
/** Both channels' schemes parse — receiving is harmless, launching is what must not cross. */
const OAUTH_DEEPLINK_SCHEMES = ['chatic:', 'chatic-dev:'];
const OAUTH_DEEPLINK_HOST = 'oauth';

/** Providers the relay flow is wired for. A deeplink naming anything else is not ours. */
const OAUTH_PROVIDERS = ['google', 'apple'] as const;

/** A provider the relay flow is wired for — what a sign-in button may start. */
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

const PROVIDER_NAMES: Record<OAuthProvider, string> = { google: 'Google', apple: 'Apple' };

/**
 * A provider as people read it, for copy that names the one a sign-in went through. Brand names, so
 * the same in every language; a provider with no entry falls back to its id rather than nothing.
 */
const isOAuthProvider = (provider: string): provider is OAuthProvider =>
    (OAUTH_PROVIDERS as readonly string[]).includes(provider);

export const oauthProviderName = (provider: string): string =>
    (PROVIDER_NAMES as Record<string, string | undefined>)[provider] ?? provider;

// Already lowercased by the registry (`net.socialOauth.endpoint`'s `envDefaultKey` reader lowers
// this raw name — see `webEnvAdapter.ts`'s `LOWERED_RAW_NAMES`), matching what
// `@chatic/web-config`'s `WEB_SOCIAL_OAUTH_ENDPOINT` always did. Read per call, for the same
// boot-order reason as the scheme above.
const socialOauthEndpoint = (): string => config.get<string>('net.socialOauth.endpoint') ?? '';

/**
 * Relay authorize URL returning to this origin's hand-off page. The `nonce` rides the `redirect`
 * back-address and is relied on to come back with the code; a hand-off that returns without it is
 * shown as a failure (see `evaluateOAuthDeeplink`).
 *
 * The provider rides it too. The hand-off page reads the provider off its own address, and one the
 * relay did not name would otherwise be taken for Google — an Apple code then fails the start's
 * provider check. When the relay appends its own `provider`, the page reads the first one, this one.
 */
export const buildAuthorizeUrl = (provider: string, nonce: string): string => {
    const handoff = new URL('/auth/oauth-response', window.location.origin);
    handoff.searchParams.set('nonce', nonce);
    handoff.searchParams.set('provider', provider);
    return `${socialOauthEndpoint()}/oauth/${provider}/authorize?redirect=${encodeURIComponent(handoff.toString())}`;
};

/**
 * A deeplink that only brings the app forward: the shell raises its window for any link of its scheme,
 * and nothing in the app acts on this one. Used where the next step is in the app, not in the browser.
 */
export const buildAppDeeplink = (): string => `${protocolScheme()}://open`;

/** Hand-off deeplink carrying the relay code and the start's nonce back into the shell. */
export const buildOAuthDeeplink = (provider: string, code: string, nonce: string): string =>
    `${protocolScheme()}://oauth?${new URLSearchParams({ provider, code, nonce }).toString()}`;

export interface OAuthDeeplinkPayload {
    provider: string;
    code: string;
    /**
     * Optional on purpose: a link without one still parses, so that `evaluateOAuthDeeplink` refuses it
     * where the person is told, instead of the parser dropping it silently.
     */
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
    if (!code || !isOAuthProvider(provider)) return null;
    const nonce = parsed.searchParams.get('nonce');
    return nonce ? { provider, code, nonce } : { provider, code };
};
