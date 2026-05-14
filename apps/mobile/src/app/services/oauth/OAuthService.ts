import type {
    CancelledResponse,
    GetTokensResponse,
    SignInSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { AppleCredentialState, AppleRequestResponse } from '@invertase/react-native-apple-authentication';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import type { OAuthLoginProvider, OAuthTokenResult, Platform as PlatformType } from '@chatic/app-messages';
import Config from 'react-native-config';
import { Platform } from 'react-native';
import type { IOAuthService } from './types';
import type { ILogService } from '../log';

export class OAuthService implements IOAuthService {
    constructor(private readonly logger: ILogService) {
        // Google 로그인 설정 초기화
        GoogleSignin.configure({
            webClientId: Config.VITE_GOOGLE_WEB_CLIENT_ID,
            offlineAccess: true,
        });
    }

    private getPlatform(): PlatformType {
        return Platform.OS === 'ios' ? 'ios' : 'android';
    }

    async login(provider: OAuthLoginProvider): Promise<OAuthTokenResult | null> {
        try {
            switch (provider) {
                case 'google':
                    return await this.signInWithGoogle();
                case 'apple':
                    return await this.signInWithApple();
                default:
                    this.logger.error('OAUTH', `Not supported type (${provider})`);
                    return null;
            }
        } catch (err) {
            this.logger.error('OAUTH', `Failed to get oauth token (${provider})`, err);
            return null;
        }
    }

    async logout(provider: OAuthLoginProvider): Promise<boolean> {
        try {
            switch (provider) {
                case 'google':
                    await GoogleSignin.revokeAccess();
                    await GoogleSignin.signOut();
                    this.logger.info('OAUTH', 'Google Logout Success');
                    break;
                case 'apple':
                    this.logger.info('OAUTH', 'Apple Logout Success (No-op)');
                    break;
                default:
                    this.logger.warn('OAUTH', `Unknown provider for logout: ${provider}`);
                    return false;
            }
            return true;
        } catch (error) {
            this.logger.error('OAUTH', `${provider} Logout Error`, error);
            return false;
        }
    }

    private async signInWithGoogle(): Promise<OAuthTokenResult | null> {
        try {
            await GoogleSignin.signOut();
            const userInfo: SignInSuccessResponse | CancelledResponse = await GoogleSignin.signIn();

            if (userInfo.type === 'cancelled') {
                this.logger.info('OAUTH', 'Google Sign-In cancelled by user');
                return null;
            }

            if (userInfo.type === 'success') {
                const tokens: GetTokensResponse = await GoogleSignin.getTokens();
                const idToken: string | null = userInfo.data.idToken;

                if (!idToken) {
                    this.logger.error('OAUTH', 'Google Sign-In failed: No idToken found in success response', {
                        userInfo,
                    });
                    return null;
                }

                this.logger.info('OAUTH', 'Google Sign-In Success');

                return {
                    provider: 'google',
                    platform: this.getPlatform(),
                    idToken: idToken,
                    accessToken: tokens.accessToken,
                    accessTokenExpiredAt: new Date().toISOString(),
                    refreshToken: undefined,
                };
            }

            this.logger.warn('OAUTH', 'Google Sign-In returned unknown type', { userInfo });
            return null;
        } catch (error: any) {
            this.logger.error('OAUTH', 'Google Sign-In Error', error);
            return null;
        }
    }

    private async signInWithApple(): Promise<OAuthTokenResult | null> {
        try {
            const response: AppleRequestResponse = await appleAuth.performRequest({
                requestedOperation: appleAuth.Operation.LOGIN,
                requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
            });

            const credentialState: AppleCredentialState = await appleAuth.getCredentialStateForUser(response.user);

            if (credentialState === appleAuth.State.AUTHORIZED) {
                this.logger.info('OAUTH', 'Apple Sign-In Success');

                if (!response.identityToken) {
                    this.logger.error('OAUTH', 'Apple Sign-In failed: No identityToken found');
                    return null;
                }

                return {
                    provider: 'apple',
                    platform: this.getPlatform(),
                    identityToken: response.identityToken,
                    email: response.email ?? undefined,
                    nonce: response.nonce,
                    user: response.user,
                    fullName: response.fullName ?? undefined,
                    authorizationCode: response.authorizationCode ?? undefined,
                };
            }
            this.logger.warn('OAUTH', 'Apple Sign-In credential state invalid', { credentialState });
            return null;
        } catch (error: any) {
            if (error.code === appleAuth.Error.CANCELED) {
                this.logger.info('OAUTH', 'Apple Sign-In cancelled by user');
                return null;
            }
            this.logger.error('OAUTH', 'Apple Sign-In Error', error);
            return null;
        }
    }
}
