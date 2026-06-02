import { useCallback, useEffect } from 'react';
import { useAppState } from '../../hooks';
import type { IAppBridgeHost } from '@chatic/bridges';
import type { AppBackgroundStatus, WebMessageAppHandler } from '@chatic/app-messages';

/**
 * 앱의 상태(Foreground/Background)를 감지하고 웹뷰(Web)와 동기화하는 역할을 담당하는 훅입니다.
 */
export const useAppStateHandler = (bridge: IAppBridgeHost | null) => {
    const { appState, isForeground, isBackground } = useAppState();

    const handleFetchBackgroundStatus = useCallback<WebMessageAppHandler<'FetchBackgroundStatus'>>(
        async _message => {
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
    };
};
