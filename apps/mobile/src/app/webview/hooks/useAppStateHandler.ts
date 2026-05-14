import { useCallback, useEffect } from 'react';
import { useAppState } from '../../hooks';

import type { WebViewBridge } from '../index';
import type { AppMessageData } from '@chatic/app-messages';

/**
 * 감지된 앱 상태를 웹뷰(Web)로 동기화하는 핸들러
 * 앱 상태가 변경될 때마다 자동으로 웹뷰에 'OnBackgroundStatusChanged' 메시지를 전송
 * 웹뷰 로딩 직후나 특정 시점에 현재 상태를 수동으로 보낼 수 있는 기능도 제공
 * @param bridge - 웹뷰와 통신을 담당하는 브릿지 객체
 */
export const useAppStateHandler = (bridge: WebViewBridge) => {
    const { appState, isForeground, isBackground } = useAppState();

    const syncAppStateToWeb = useCallback(() => {
        const message: AppMessageData<'OnBackgroundStatusChanged'> = {
            type: 'OnBackgroundStatusChanged',
            data: {
                status: appState as 'active' | 'background' | 'inactive',
                isForeground,
                isBackground,
            },
        };
        bridge.post(message);
    }, [bridge, appState, isForeground, isBackground]);

    useEffect(() => {
        if (!bridge) return;
        syncAppStateToWeb();
    }, [appState, bridge, syncAppStateToWeb]);

    return { syncAppStateToWeb };
};
