import type { HapticKind } from '@chatic/bridge-messages';
import { runtime } from '@chatic/runtime';

export interface Haptics {
    /** Plays `kind` where the shell can; a no-op everywhere else. Never throws, never waits. */
    play(kind: HapticKind): void;
}

/**
 * Haptics come from the shell, because the page cannot make its own: WebKit implements no
 * `navigator.vibrate`, so on iOS a buzz is only possible natively.
 *
 * Played by the frame's haptics (the host's `appShell` port), which only a shell has; where there are
 * none — a browser — nothing plays.
 */
class ShellHaptics implements Haptics {
    play(kind: HapticKind): void {
        runtime.appShell.haptics?.play(kind);
    }
}

export const haptics: Haptics = new ShellHaptics();
