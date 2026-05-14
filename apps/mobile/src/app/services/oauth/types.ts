import type { OAuthLoginProvider, OAuthTokenResult } from '@chatic/app-messages';

export interface IOAuthService {
    login(provider: OAuthLoginProvider): Promise<OAuthTokenResult | null>;
    logout(provider: OAuthLoginProvider): Promise<boolean>;
}
