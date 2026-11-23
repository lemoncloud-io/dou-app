import { useState, useEffect } from 'react';
import type { AppStateStatus } from 'react-native';
import { AppState } from 'react-native';

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
