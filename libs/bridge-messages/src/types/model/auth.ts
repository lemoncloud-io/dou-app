import type { Platform } from './common';

/** OAuth login provider type */
export type OAuthLoginProvider = 'google' | 'apple';

/** Common base type for auth results */
type BaseTokenResult = {
    /** Info on the platform where auth was performed (ios | android, etc.) */
    platform: Platform;
    /** Login provider that was used */
    provider: OAuthLoginProvider;
};

/** Details of a Google OAuth auth result */
export type GoogleOAuthTokenResult = BaseTokenResult & {
    provider: 'google';
    /** ID token for server-side verification */
    idToken: string;
    /** Access token for API access */
    accessToken?: string;
    /** Access token expiration date/time */
    accessTokenExpiredAt?: string;
    /** One-time code for server-side auth */
    serverAuthCode?: string;
    /** Refresh token used to renew the access token */
    refreshToken?: string;
};

/** Details of an Apple OAuth auth result */
export type AppleOAuthTokenResult = BaseTokenResult & {
    provider: 'apple';
    /** Identity token (JWT) for server-side verification */
    identityToken: string;
    /** Random value passed to prevent replay attacks */
    nonce?: string;
    /** Unique user identifier issued by Apple */
    user: string;
    /** User email (may only be provided on first login) */
    email?: string;
    /** User name info (only provided on first login) */
    fullName?: {
        givenName?: string | null;
        familyName?: string | null;
        namePrefix?: string | null;
        nameSuffix?: string | null;
        nickname?: string | null;
        middleName?: string | null;
    };
    /** Authorization code for server-side auth */
    authorizationCode?: string;
};

/** Unified OAuth auth result type */
export type OAuthTokenResult = GoogleOAuthTokenResult | AppleOAuthTokenResult;

/**
 * An OAuth relay code instead of a provider token.
 *
 * Only the virtual mobile shell answers with this, when its sign-in goes through the organisation's
 * OAuth relay: the relay keeps the provider's token and hands back a short-lived code, the same code
 * the desktop app exchanges. The native apps never send it — they sign in with the provider SDK and
 * answer with an `OAuthTokenResult`. The web exchanges the code itself (`verify-oauth-code`), signed
 * with the device session already on it.
 */
export type OAuthCodeResult = BaseTokenResult & {
    /** Authorization code issued by the OAuth relay, exchanged by the web for a session */
    code: string;
};

/**
 * What a sign-in answers with: a provider token from a native app, or a relay code from the virtual
 * shell. Tell them apart by `code`.
 */
export type OAuthLoginResult = OAuthTokenResult | OAuthCodeResult;

/** [Request] Payload to execute an OAuth login */
export type OAuthLoginPayload = {
    /** Login provider to execute */
    provider: OAuthLoginProvider;
};

/** [Request] Payload to execute an OAuth logout */
export type OAuthLogoutPayload = {
    /** Provider to log out of */
    provider: OAuthLoginProvider;
};

/** [Response] Payload for the OAuth login result */
export type OnOAuthLoginPayload = {
    /** * Returns the auth result object on success,
     * returns null if the user cancels or an error occurs.
     * Native apps answer with a token; only the virtual shell answers with a relay code.
     */
    result: OAuthLoginResult | null;
};

/** [Response] Payload for the OAuth logout result */
export type OnOAuthLogoutPayload = {
    /** Whether the logout succeeded */
    success: boolean;
};
