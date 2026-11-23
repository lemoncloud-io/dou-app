import { AppState } from 'react-native';

import type { RuntimePorts } from '@chatic/runtime-core';

type ForegroundPorts = RuntimePorts['foreground'];

export type AppStateSource = Pick<typeof AppState, 'currentState' | 'addEventListener'>;

export const nativeForegroundPorts = (appState: AppStateSource = AppState): ForegroundPorts => {
    const read = () => appState.currentState !== 'background';
    return {
        read,
        subscribe: listener => {
            let last = read();
            const subscription = appState.addEventListener('change', () => {
                const next = read();
                if (next === last) return;
                last = next;
                listener();
            });
            return () => subscription.remove();
        },
    };
};
