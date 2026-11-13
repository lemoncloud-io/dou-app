import { AppState } from 'react-native';

import type { RuntimePorts } from '@chatic/runtime-core';

type ForegroundPorts = RuntimePorts['foreground'];

/** The part of `AppState` the foreground signal reads. */
export type AppStateSource = Pick<typeof AppState, 'currentState' | 'addEventListener'>;

/**
 * The app's `AppState`: in front of the user unless it is `background`.
 *
 * - `inactive` counts as in front. On iOS it is the app still on screen with something over it — the
 *   control centre, an incoming call, the app switcher on its way — which is what a page that stays
 *   `visible` under a system sheet is too. The session's retries wait for a return from the
 *   background, and a pulled-down notification centre is not one.
 * - Before React Native knows (`unknown`, or no state yet at a very early boot) it answers in front:
 *   a retry that waits for a return it cannot observe would wait forever.
 *
 * A subscriber hears only a change of that answer. Its readers run a credential check or a push
 * registration whenever they are called and the app is in front, so passing on every `change` event
 * would run them on the way to `inactive` and back — twice for each pull of the control centre — where
 * a page's `visibilitychange` fires only when the page is really hidden or shown.
 */
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
