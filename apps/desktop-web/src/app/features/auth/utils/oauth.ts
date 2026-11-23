import { runtime } from '@chatic/runtime';

const protocolScheme = (): string => runtime.settings.get<string>('net.deeplink.desktopProtocol') ?? 'chatic';

export const isSocialLoginEnabled = (): boolean => runtime.settings.get<boolean>('feature.auth.socialLogin') !== false;
const OAUTH_DEEPLINK_SCHEMES = ['chatic:', 'chatic-dev:'];
const OAUTH_DEEPLINK_HOST = 'oauth';

const PROVIDER_NAMES = { google: 'Google', apple: 'Apple' } as const;

export type OAuthProvider = keyof typeof PROVIDER_NAMES;

const isOAuthProvider = (provider: string): provider is OAuthProvider =>
    Object.prototype.hasOwnProperty.call(PROVIDER_NAMES, provider);

export const oauthProviderName = (provider: string): string =>
    isOAuthProvider(provider) ? PROVIDER_NAMES[provider] : provider;

const socialOauthEndpoint = (): string => runtime.settings.get<string>('net.socialOauth.endpoint') ?? '';

export const buildAuthorizeUrl = (provider: OAuthProvider, nonce: string): string => {
    const handoff = new URL('/auth/oauth-response', window.location.origin);
    handoff.searchParams.set('nonce', nonce);
    handoff.searchParams.set('provider', provider);
    return `${socialOauthEndpoint()}/oauth/${provider}/authorize?redirect=${encodeURIComponent(handoff.toString())}`;
};

export const buildAppDeeplink = (): string => `${protocolScheme()}://open`;

export const buildOAuthDeeplink = (provider: string, code: string, nonce: string): string =>
    `${protocolScheme()}://oauth?${new URLSearchParams({ provider, code, nonce }).toString()}`;

export interface OAuthDeeplinkPayload {
    provider: string;
    code: string;
    nonce?: string;
}

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
