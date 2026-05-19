import { useCallback, useEffect } from 'react';
import { useAppState } from '../../hooks';
import type { IAppBridgeHost } from '@chatic/bridges';
import type {
    AppBackgroundStatus,
    FetchBackgroundStatus,
    OnBackgroundStatusChanged,
    OnBackgroundStatusChangedPayload,
} from '@chatic/app-messages';

/**
 * 앱의 상태(Foreground/Background)를 감지하고 웹뷰(Web)와 동기화하는 역할을 담당하는 훅입니다.
 *
 * 1. **요청/응답 (Request/Response):** 웹에서 현재 앱 상태를 요청(`FetchBackgroundStatus`)하면, 현재 상태를 응답으로 반환합니다.
 * 2. **이벤트 (Event):** 앱의 상태가 변경될 때마다, 웹에 `OnBackgroundStatusChanged` 이벤트를 전송하여 상태 변경을 알립니다.
 *
 * @param bridge - 웹뷰와 통신을 담당하는 브릿지 호스트 객체.
 */
export const useAppStateHandler = (bridge: IAppBridgeHost | null) => {
    const { appState, isForeground, isBackground } = useAppState();

    /**
     * [요청 핸들러] 웹으로부터 `FetchBackgroundStatus` 요청을 받으면 현재 앱 상태를 응답으로 반환합니다.
     * 만약 앱 상태가 'unknown'인 경우, 앱이 활성화된 상태로 간주하고 안전한 기본값을 반환합니다.
     */
    const handleFetchBackgroundStatus = useCallback(
        (_message: FetchBackgroundStatus): OnBackgroundStatusChangedPayload => {
            if (appState === 'unknown') {
                // 요청/응답 모델에서는 반드시 응답을 보내야 하므로,
                // 상태를 알 수 없는 경우 가장 안전한 'active' 상태로 응답합니다.
                return {
                    status: 'active',
                    isForeground: true,
                    isBackground: false,
                };
            }
            return {
                status: appState as AppBackgroundStatus, // 'unknown'이 필터링되었으므로 타입 단언이 안전합니다.
                isForeground,
                isBackground,
            };
        },
        [appState, isForeground, isBackground]
    );

    /**
     * [이벤트 전송] 앱 상태가 변경될 때마다 웹에 `OnBackgroundStatusChanged` 이벤트를 전송합니다.
     * 'unknown' 상태는 무시하고 전송하지 않습니다.
     */
    useEffect(() => {
        // 'unknown' 상태는 불안정하므로 웹으로 전송하지 않습니다.
        if (!bridge || appState === 'unknown') {
            return;
        }

        // 앱 상태가 변경될 때마다 웹으로 이벤트를 보냅니다.
        bridge.pushEvent({
            type: 'OnBackgroundStatusChanged',
            data: {
                status: appState as AppBackgroundStatus,
                isForeground,
                isBackground,
            },
        } as OnBackgroundStatusChanged);
    }, [appState, bridge, isForeground, isBackground]);

    return {
        handleFetchBackgroundStatus,
    };
};
