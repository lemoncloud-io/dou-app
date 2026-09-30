import { isNative } from '@chatic/bridges';
import type { HapticKind } from '@chatic/app-messages';

import { appBridge } from './appBridge';

export interface Haptics {
    /** Plays `kind` where the shell can; a no-op everywhere else. Never throws, never waits. */
    play(kind: HapticKind): void;
    /** Test seam — forgets the learned verdict. */
    reset(): void;
}

const isNotFound = (error: unknown): boolean => (error as { code?: string })?.code === 'NOT_FOUND';

/**
 * Haptics come from the shell, because the page cannot make its own: WebKit implements no
 * `navigator.vibrate`, so on iOS a buzz is only possible natively.
 *
 * The web ships ahead of the app, so this runs inside app builds with no handler for the message.
 * The first haptic is therefore a request, and its answer settles the session — one installed app,
 * one answer. `NOT_FOUND` means an app built before the message, and nothing more is sent. A success
 * means every later haptic can be a one-way post, which the shell plays without answering: a reply
 * is a trip back across the bridge on the UI thread, in the middle of the gesture that asked for it.
 * Any other failure is a transient bridge problem and changes nothing. A browser is never asked.
 * Same reasoning as `photoLibrary`.
 */
class ShellHaptics implements Haptics {
    private support: 'unknown' | 'supported' | 'unsupported' = 'unknown';

    play(kind: HapticKind): void {
        if (this.support === 'unsupported' || !isNative()) return;
        if (this.support === 'supported') {
            appBridge.postHaptic(kind);
            return;
        }
        appBridge
            .triggerHaptic(kind)
            .then(() => {
                this.support = 'supported';
            })
            .catch(error => {
                if (isNotFound(error)) this.support = 'unsupported';
            });
    }

    reset(): void {
        this.support = 'unknown';
    }
}

export const haptics: Haptics = new ShellHaptics();
