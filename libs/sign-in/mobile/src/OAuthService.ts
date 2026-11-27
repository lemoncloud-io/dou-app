import type {
    CancelledResponse,
    GetTokensResponse,
    SignInSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { AppleCredentialState, AppleRequestResponse } from '@invertase/react-native-apple-authentication';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import { Platform } from 'react-native';
import type { Logger } from '@chatic/logger';
import type { SignInPlatform, SignInProvider, SignInToken } from '@chatic/ports';

import type { IOAuthService, OAuthServiceOptions } from './types';

const isAppleCancel = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === appleAuth.Error.CANCELED;

export class OAuthService implements IOAuthService {
    constructor(
        private readonly logger: Logger,
        { googleWebClientId }: OAuthServiceOptions
    ) {
        GoogleSignin.configure({
            webClientId: googleWebClientId,
            offlineAccess: true,
        });
    }

    private getPlatform(): SignInPlatform {
        return Platform.OS === 'ios' ? 'ios' : 'android';
    }

    async login(provider: SignInProvider): Promise<SignInToken | null> {
        switch (provider) {
            case 'google':
                return await this.signInWithGoogle();
            case 'apple':
                return await this.signInWithApple();
            default:
                throw new Error(`Not supported type (${provider})`);
        }
    }

    async logout(provider: SignInProvider): Promise<boolean> {
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

    private async signInWithGoogle(): Promise<SignInToken | null> {
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
                    throw new Error('Google Sign-In failed: No idToken found in success response');
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

            throw new Error('Google Sign-In returned unknown type');
        } catch (error: unknown) {
            this.logger.error('OAUTH', 'Google Sign-In Error', error);
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    private async signInWithApple(): Promise<SignInToken | null> {
        try {
            const response: AppleRequestResponse = await appleAuth.performRequest({
                requestedOperation: appleAuth.Operation.LOGIN,
                requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
            });

            const credentialState: AppleCredentialState = await appleAuth.getCredentialStateForUser(response.user);

            if (credentialState === appleAuth.State.AUTHORIZED) {
                this.logger.info('OAUTH', 'Apple Sign-In Success');

                if (!response.identityToken) {
                    throw new Error('Apple Sign-In failed: No identityToken found');
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
            throw new Error(`Apple Sign-In credential state invalid: ${String(credentialState)}`);
        } catch (error: unknown) {
            if (isAppleCancel(error)) {
                this.logger.info('OAUTH', 'Apple Sign-In cancelled by user');
                return null;
            }
            this.logger.error('OAUTH', 'Apple Sign-In Error', error);
            throw error instanceof Error ? error : new Error(String(error));
        }
    }
}
