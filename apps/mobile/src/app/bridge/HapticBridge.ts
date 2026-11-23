import { NativeModules } from 'react-native';

import type { HapticKind } from '@chatic/bridge-messages';

const { Haptic } = NativeModules;

export interface IHapticBridge {
    trigger(kind: HapticKind): boolean;
}

export const HapticBridge: IHapticBridge = {
    trigger: kind => {
        if (!Haptic?.trigger) return false;
        Haptic.trigger(kind);
        return true;
    },
};
