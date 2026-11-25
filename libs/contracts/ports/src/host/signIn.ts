import type { HostOs, ShellOrBrowser } from './ports';

export type SignInProvider = 'google' | 'apple';

export type SignInPlatform = 'ios' | 'android' | 'windows' | 'macos' | 'web';

type SignInResultBase = {
    platform: SignInPlatform;
    provider: SignInProvider;
};

export type GoogleSignInToken = SignInResultBase & {
    provider: 'google';
    idToken: string;
    accessToken?: string;
    accessTokenExpiredAt?: string;
    serverAuthCode?: string;
    refreshToken?: string;
};

export type AppleSignInToken = SignInResultBase & {
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

export type SignInToken = GoogleSignInToken | AppleSignInToken;

export type SignInCode = SignInResultBase & {
    code: string;
};

export type SignInCredential = SignInToken | SignInCode;

export type ProviderSignInError = {
    code: string;
    message: string;
    details?: unknown;
};

export type ProviderSignInOutcome = {
    refId?: string;
    version?: string;
    nonce?: string;
} & {
    type: 'OnOAuthLogin';
    success: boolean;
    error?: ProviderSignInError;
    data: { result: SignInCredential | null };
};

export interface SignInPort {
    readonly kind: ShellOrBrowser;
    readonly os: HostOs;
    readonly sessionScope: 'device' | 'tab';
    readonly approvesPairing: boolean;
    readonly requestsPairing: boolean;
    readonly providerSignIn: ProviderSignIn | null;
    readonly relayOAuth: RelayOAuth | null;
}

export interface ProviderSignIn {
    readonly providers: readonly SignInProvider[];
    start(provider: SignInProvider): void;
    onResult(listener: (outcome: ProviderSignInOutcome) => void): () => void;
    credential(provider: SignInProvider): Promise<SignInCredential | null>;
}

export interface RelayOAuth {
    openAuthorize(url: string): void;
    readonly returnedCode: 'complete' | 'handoff';
    readonly handoffLinks: HandoffLinks | null;
}

export interface HandoffLinks {
    subscribe(listener: (deeplink: string) => void): () => void;
}
