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
import { logger } from './log';

// Google 로그인 설정 초기화
GoogleSignin.configure({
    webClientId: Config.VITE_GOOGLE_WEB_CLIENT_ID,
    offlineAccess: true,
});

export const oAuthService = {
    /**
     * OAuth 로그인 처리
     */
    login: async (provider: OAuthLoginProvider): Promise<OAuthTokenResult | null> => {
        try {
            switch (provider) {
                case 'google':
                    return await signInWithGoogle();
                case 'apple':
                    return await signInWithApple();
                default:
                    logger.error('OAUTH', `Not supported type (${provider})`);
                    return null;
            }
        } catch (err) {
            logger.error('OAUTH', `Failed to get oauth token (${provider})`, err);
            return null;
        }
    },

    /**
     * OAuth 로그아웃 처리
     */
    logout: async (provider: OAuthLoginProvider): Promise<boolean> => {
        try {
            switch (provider) {
                case 'google':
                    await GoogleSignin.revokeAccess();
                    await GoogleSignin.signOut();
                    logger.info('OAUTH', 'Google Logout Success');
                    break;
                case 'apple':
                    logger.info('OAUTH', 'Apple Logout Success (No-op)');
                    break;
                default:
                    logger.warn('OAUTH', `Unknown provider for logout: ${provider}`);
                    return false;
            }
            return true;
        } catch (error) {
            logger.error('OAUTH', `${provider} Logout Error`, error);
            return false;
        }
    },
};

const getPlatform = (): PlatformType => {
    return Platform.OS === 'ios' ? 'ios' : 'android';
};

/**
 * - Google Login
 * - Google Login은 Android, iOS 디바이스 공통적으로 사용가능
 * - `idToken`을 불러오지 못할경우 null 반환
 */
const signInWithGoogle = async (): Promise<OAuthTokenResult | null> => {
    try {
        await GoogleSignin.signOut();
        const userInfo: SignInSuccessResponse | CancelledResponse = await GoogleSignin.signIn();

        if (userInfo.type === 'cancelled') {
            logger.info('OAUTH', 'Google Sign-In cancelled by user');
            return null;
        }

        if (userInfo.type === 'success') {
            const tokens: GetTokensResponse = await GoogleSignin.getTokens();
            const idToken: string | null = userInfo.data.idToken;

            if (!idToken) {
                logger.error('OAUTH', 'Google Sign-In failed: No idToken found in success response', { userInfo });
                return null;
            }

            logger.info('OAUTH', 'Google Sign-In Success');

            return {
                provider: 'google',
                platform: getPlatform(),
                idToken: idToken,
                accessToken: tokens.accessToken,
                accessTokenExpiredAt: new Date().toISOString(),
                refreshToken: undefined,
            };
        }

        logger.warn('OAUTH', 'Google Sign-In returned unknown type', { userInfo });
        return null;
    } catch (error: any) {
        logger.error('OAUTH', 'Google Sign-In Error', error);
        return null;
    }
};

/**
 * - Apple Login
 * - Apple Login은 iOS 디바이스에만 사용가능
 * - `identityToken`을 불러오지 못할경우 null 반환
 */
const signInWithApple = async (): Promise<OAuthTokenResult | null> => {
    try {
        const response: AppleRequestResponse = await appleAuth.performRequest({
            requestedOperation: appleAuth.Operation.LOGIN,
            requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
        });

        const credentialState: AppleCredentialState = await appleAuth.getCredentialStateForUser(response.user);

        if (credentialState === appleAuth.State.AUTHORIZED) {
            logger.info('OAUTH', 'Apple Sign-In Success');

            if (!response.identityToken) {
                logger.error('OAUTH', 'Apple Sign-In failed: No identityToken found');
                return null;
            }

            return {
                provider: 'apple',
                platform: getPlatform(),
                identityToken: response.identityToken,
                email: response.email ?? undefined,
                nonce: response.nonce,
                user: response.user,
                fullName: response.fullName ?? undefined,
                authorizationCode: response.authorizationCode ?? undefined,
            };
        }
        logger.warn('OAUTH', 'Apple Sign-In credential state invalid', { credentialState });
        return null;
    } catch (error: any) {
        if (error.code === appleAuth.Error.CANCELED) {
            logger.info('OAUTH', 'Apple Sign-In cancelled by user');
            return null;
        }
        logger.error('OAUTH', 'Apple Sign-In Error', error);
        return null;
    }
};
