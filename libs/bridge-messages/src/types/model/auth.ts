import type { Platform } from './common';

export type OAuthLoginProvider = 'google' | 'apple';

type BaseTokenResult = {
    platform: Platform;
    provider: OAuthLoginProvider;
};

export type GoogleOAuthTokenResult = BaseTokenResult & {
    provider: 'google';
    idToken: string;
    accessToken?: string;
    accessTokenExpiredAt?: string;
    serverAuthCode?: string;
    refreshToken?: string;
};

export type AppleOAuthTokenResult = BaseTokenResult & {
    provider: 'apple';
    identityToken: string;
    nonce?: string;
    user: string;
    email?: string;
    fullName?: {
        givenName?: string | null;
        familyName?: string | null;
        namePrefix?: string | null;
        nameSuffix?: string | null;
        nickname?: string | null;
        middleName?: string | null;
    };
    authorizationCode?: string;
};

export type OAuthTokenResult = GoogleOAuthTokenResult | AppleOAuthTokenResult;

export type OAuthCodeResult = BaseTokenResult & {
    code: string;
};

export type OAuthLoginResult = OAuthTokenResult | OAuthCodeResult;

export type OAuthLoginPayload = {
    provider: OAuthLoginProvider;
};

export type OAuthLogoutPayload = {
    provider: OAuthLoginProvider;
};

export type OnOAuthLoginPayload = {
    result: OAuthLoginResult | null;
};

export type OnOAuthLogoutPayload = {
    success: boolean;
};
