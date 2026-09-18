import { useState, useEffect } from 'react';
import type { AppStateStatus } from 'react-native';
import { AppState } from 'react-native';

/**
 * A custom hook that detects the device's app run state (Foreground/Background)
 *
 * Uses React Native's AppState API to track whether the app is currently visible on the user's
 * screen, has moved to the background, or is in an inactive state.
 *
 * @returns appState - the raw current app state ('active' | 'background' | 'inactive')
 * @returns isForeground - whether the app is active and the user is currently interacting with it
 * @returns isBackground - whether the app has fully entered the background
 * @returns isInactive - (mainly iOS) whether the app is momentarily inactive, e.g. due to the
 *   notification center being pulled down or an incoming call
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
