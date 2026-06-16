import { useCallback, useEffect } from 'react';
import { useAppState } from '../../hooks';
import type { IAppBridgeHost } from '@chatic/bridges';
import type { AppBackgroundStatus, WebMessageData } from '@chatic/app-messages';
import { logger } from '../../services';

/**
 * 앱의 상태(Foreground/Background)를 감지하고 웹뷰(Web)와 동기화하는 역할을 담당하는 훅입니다.
 * 또한, 백그라운드 복귀 화면 오버레이 해제(DismissResumeOverlay) 처리도 수행합니다.
 */
export const useAppStateHandler = (bridge: IAppBridgeHost | null, onDismissOverlay?: () => void) => {
    const { appState, isForeground, isBackground } = useAppState();

    const handleFetchBackgroundStatus = useCallback(
        async (_message: WebMessageData<'FetchBackgroundStatus'>) => {
            if (appState === 'unknown') {
                return {
                    type: 'OnBackgroundStatusChanged' as const,
                    success: true,
                    data: {
                        status: 'active',
                        isForeground: true,
                        isBackground: false,
                    },
                };
            }
            return {
                type: 'OnBackgroundStatusChanged' as const,
                success: true,
                data: {
                    status: appState as AppBackgroundStatus,
                    isForeground,
                    isBackground,
                },
            };
        },
        [appState, isForeground, isBackground]
    );

    const handleDismissResumeOverlay = useCallback(
        async (_message: WebMessageData<'DismissResumeOverlay'>) => {
            logger.info('WEBVIEW', 'DismissResumeOverlay received from WebView repaint animation');
            onDismissOverlay?.();
            return {
                type: 'OnDismissResumeOverlay' as const,
                success: true,
                data: {},
            };
        },
        [onDismissOverlay]
    );

    useEffect(() => {
        if (!bridge || appState === 'unknown') {
            return;
        }

        bridge.pushEvent<'OnBackgroundStatusChanged'>({
            type: 'OnBackgroundStatusChanged',
            success: true,
            data: {
                status: appState as AppBackgroundStatus,
                isForeground,
                isBackground,
            },
        });
    }, [appState, bridge, isForeground, isBackground]);

    return {
        handleFetchBackgroundStatus,
        handleDismissResumeOverlay,
    };
};
