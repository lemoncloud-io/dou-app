import type { SignInProvider, SignInToken } from '@chatic/ports';

export interface IOAuthService {
    login(provider: SignInProvider): Promise<SignInToken | null>;
    logout(provider: SignInProvider): Promise<boolean>;
}

export interface OAuthServiceOptions {
    googleWebClientId: string | undefined;
}
