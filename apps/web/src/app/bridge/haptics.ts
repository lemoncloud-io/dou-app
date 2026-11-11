import { isNative } from '@chatic/bridges';
import type { HapticKind } from '@chatic/bridge-messages';

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
 * back across the bridge on the UI thread, in the middle of the gesture that asked for it. A browser
 * is never asked.
 */
class ShellHaptics implements Haptics {
    play(kind: HapticKind): void {
        if (!isNative()) return;
        appBridge.postHaptic(kind);
    }
}

export const haptics: Haptics = new ShellHaptics();
