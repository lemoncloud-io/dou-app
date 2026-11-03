import type { OAuthLoginProvider, OAuthTokenResult } from '@chatic/bridge-messages';

export interface IOAuthService {
    login(provider: OAuthLoginProvider): Promise<OAuthTokenResult | null>;
    logout(provider: OAuthLoginProvider): Promise<boolean>;
}
