import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { OAuthLogin, OAuthLogout, OnOAuthLoginPayload, OnOAuthLogoutPayload } from '@chatic/app-messages';

export const useOAuthHandler = () => {
    const { oauthService: oAuthService, logService: logger } = useServices();
    /**
     * OAuth 로그인
     */
    const handleOAuthLogin = useCallback(
        async (message: OAuthLogin): Promise<OnOAuthLoginPayload> => {
            const { provider } = message.data;
            try {
                const result = await oAuthService.login(provider);
                return { result };
            } catch (error) {
                logger.error('OAUTH', `Login error for provider ${provider}`, error);
                throw error;
            }
        },
        [oAuthService, logger]
    );

    /**
     * OAuth 로그아웃
     * `Apple`의 경우 별도 logout 로직이 존재하지 않아 무조건 `true`를 반환
     */
    const handleOAuthLogout = useCallback(
        async (message: OAuthLogout): Promise<OnOAuthLogoutPayload> => {
            const { provider } = message.data;

            try {
                const success: boolean = await oAuthService.logout(provider);
                return { success };
            } catch (error) {
                logger.error('OAUTH', `Logout error for provider ${provider}`, error);
                throw error;
            }
        },
        [oAuthService, logger]
    );

    return {
        handleOAuthLogin,
        handleOAuthLogout,
    };
};
