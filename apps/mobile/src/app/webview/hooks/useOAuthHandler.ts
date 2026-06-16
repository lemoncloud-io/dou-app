import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { WebMessageData } from '@chatic/app-messages';

export const useOAuthHandler = () => {
    const { oauthService: oAuthService, logService: logger } = useServices();

    /**
     * OAuth 로그인
     */
    const handleOAuthLogin = useCallback(
        async (message: WebMessageData<'OAuthLogin'>) => {
            const { provider } = message.data;
            try {
                const result = await oAuthService.login(provider);
                return {
                    type: 'OnOAuthLogin' as const,
                    success: true,
                    data: { result },
                };
            } catch (error: any) {
                logger.error('OAUTH', `Login error for provider ${provider}`, error);
                return {
                    type: 'OnOAuthLogin' as const,
                    success: false,
                    error: { code: 'OAUTH_LOGIN_ERROR', message: error.message },
                };
            }
        },
        [oAuthService, logger]
    );

    /**
     * OAuth 로그아웃
     */
    const handleOAuthLogout = useCallback(
        async (message: WebMessageData<'OAuthLogout'>) => {
            const { provider } = message.data;
            try {
                const success: boolean = await oAuthService.logout(provider);
                return {
                    type: 'OnOAuthLogout' as const,
                    success: true,
                    data: { success },
                };
            } catch (error: any) {
                logger.error('OAUTH', `Logout error for provider ${provider}`, error);
                return {
                    type: 'OnOAuthLogout' as const,
                    success: false,
                    error: { code: 'OAUTH_LOGOUT_ERROR', message: error.message },
                };
            }
        },
        [oAuthService, logger]
    );

    return {
        handleOAuthLogin,
        handleOAuthLogout,
    };
};
