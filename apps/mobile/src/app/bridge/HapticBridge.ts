import { NativeModules } from 'react-native';

import type { HapticKind } from '@chatic/app-messages';

const { Haptic } = NativeModules;

export interface IHapticBridge {
    /** Plays one short haptic. Returns whether a native module took it; never throws. */
    trigger(kind: HapticKind): boolean;
}

/**
 * The native `Haptic` module (Kotlin `HapticModule`, Obj-C `HapticModule.m`).
 *
 * Silent when the module is missing, like `SharedLanguageBridge` and unlike the bridges that warn: a
 * haptic is asked for on every swipe and pull, so a warning would repeat per gesture on a build whose
 * native side predates the module, and a missing buzz costs nothing but the buzz.
 */
export const HapticBridge: IHapticBridge = {
    trigger: kind => {
        if (!Haptic?.trigger) return false;
        Haptic.trigger(kind);
        return true;
    },
};
