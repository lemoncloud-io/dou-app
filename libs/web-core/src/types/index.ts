export interface VerifyNativeTokenBody {
    /**
     * provider of this token
     */
    provider?: string | 'test';
    /**
     * (optiona) id-token
     * - google: https://developers.google.com/identity/sign-in/web/backend-auth?hl=ko
     */
    idToken?: string;
    /**
     * access-token (in format of jwt)
     */
    accessToken?: string;
    /**
     * refresh-token
     */
    refreshToken?: string;
    /** (optional) signature for `test` provider */
    signature?: string;
}

export interface LoginUserResult {
    id: string;
    createdAt: number;
    updatedAt?: number;
    deletedAt?: number;
    name: string;
    stereo: string;
    aliasId: string;
    loginId: string;
    loginPw: string;
    Token: LoginToken;
}

export interface LemonToken {
    authId: string;
    accountId: string;
    identityId: string;
    identityPoolId: string;
    identityToken: string;
    credential: {
        AccessKeyId: string;
        SecretKey: string;
        SessionToken: string;
        Expiration: string;
    };
}
export interface LemonRefreshTokenResult {
    id: string;
    createdAt: number;
    updatedAt: number;
    deletedAt: number;
    accountId: string;
    name: string;
    nick: string;
    Token: LemonToken;
    $site: {
        id: string;
        createdAt: number;
        updatedAt: number;
        deletedAt: number;
        name: string;
        domain: string;
    };
    $auth: {
        id: string;
        createdAt: number;
        updatedAt: number;
        deletedAt: number;
        stereo: string;
        accountId: string;
        userId: string;
    };
}

export interface LoginToken {
    authId: string;
    accountId: string;
    identityId: string;
    identityToken: string;
}
