import type { HapticKind } from '@chatic/bridge-messages';
import { host } from '@chatic/host';

import { appBridge } from './appBridge';

export interface Haptics {
    /** Plays `kind` where the shell can; a no-op everywhere else. Never throws, never waits. */
    play(kind: HapticKind): void;
}

/**
 * Haptics come from the shell, because the page cannot make its own: WebKit implements no
 * `navigator.vibrate`, so on iOS a buzz is only possible natively.
 *
 * Every haptic is a one-way post, which the shell plays without answering: a reply would be a trip
 * back across the bridge on the UI thread, in the middle of the gesture that asked for it. Only where
 * the app runs the frame around the page (the host's `appShell` port) is the shell asked; a browser
 * never is.
 */
class ShellHaptics implements Haptics {
    play(kind: HapticKind): void {
        if (host.ports.appShell.kind !== 'shell') return;
        appBridge.postHaptic(kind);
    }
}

export const haptics: Haptics = new ShellHaptics();
