import type { HapticKind } from '@chatic/bridge-messages';
import { runtime } from '@chatic/runtime';

export interface Haptics {
    play(kind: HapticKind): void;
}

class ShellHaptics implements Haptics {
    play(kind: HapticKind): void {
        runtime.appShell.haptics?.play(kind);
    }
}

export const haptics: Haptics = new ShellHaptics();
