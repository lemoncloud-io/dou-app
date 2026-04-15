import { useState, useEffect } from 'react';
import type { AppStateStatus } from 'react-native';
import { AppState } from 'react-native';

/**
 * 디바이스의 앱 실행 상태(Foreground/Background)를 감지하는 커스텀 훅
 *
 * React Native의 AppState API를 활용하여 현재 앱이 사용자 화면에 보이는지,
 * 백그라운드로 전환되었는지, 혹은 비활성(inactive) 상태인지를 추적합니다.
 *
 * @returns appState - 현재 앱 상태 원본 ('active' | 'background' | 'inactive')
 * @returns isForeground - 앱이 활성화되어 사용자와 상호작용 중인지 여부
 * @returns isBackground - 앱이 완전히 백그라운드로 진입했는지 여부
 * @returns isInactive - (주로 iOS) 알림창 드롭다운, 전화 수신 등으로 인해 일시적으로 비활성화된 상태 여부
 */
export const useAppState = () => {
    const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            setAppState(nextAppState);
        });

        return () => {
            subscription.remove();
        };
    }, []);

    return {
        appState,
        isForeground: appState === 'active',
        isBackground: appState === 'background',
        isInactive: appState === 'inactive',
    };
};
