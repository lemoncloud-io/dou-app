import { useCallback } from 'react';
import { oAuthService } from '../../services';
import type { OAuthLoginProvider } from '@chatic/app-messages';
import type { WebViewBridge } from './useBaseBridge';

export const useOAuthHandler = (bridge: WebViewBridge) => {
    /**
     * OAuth 로그인
     */
    const handleOAuthLogin: (provider: OAuthLoginProvider) => Promise<void> = useCallback(
        async (provider: OAuthLoginProvider) => {
            const result = await oAuthService.login(provider);
            bridge.post({
                type: 'OnOAuthLogin',
                data: { result },
            });
        },
        [bridge]
    );

    /**
     * OAuth 로그아웃
     * `Apple`의 경우 별도 logout 로직이 존재하지 않아 무조건 `true`를 반환
     */
    const handleOAuthLogout: (provider: OAuthLoginProvider) => Promise<void> = useCallback(
        async (provider: OAuthLoginProvider) => {
            const success: boolean = await oAuthService.logout(provider);
            bridge.post({
                type: 'OnOAuthLogout',
                data: { success },
            });
        },
        [bridge]
    );

    return {
        handleOAuthLogin,
        handleOAuthLogout,
    };
};
